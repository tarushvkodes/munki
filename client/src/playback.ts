import { useEffect, useRef, type RefObject } from "react";

type RegisteredMedia = {
  id: string;
  element: HTMLMediaElement;
};

class PlaybackController {
  private registered = new Map<string, HTMLMediaElement>();
  private active: RegisteredMedia | null = null;
  private requestGeneration = 0;

  register(id: string, element: HTMLMediaElement) {
    const previous = this.registered.get(id);
    if (previous && previous !== element) this.stopElement(previous);
    this.registered.set(id, element);

    return () => {
      if (this.registered.get(id) !== element) return;
      this.stop(id, element);
      this.registered.delete(id);
    };
  }

  async play(id: string, element: HTMLMediaElement) {
    const generation = ++this.requestGeneration;
    this.stopEveryElementExcept(element);
    this.active = { id, element };

    try {
      await element.play();
      // A late play() resolution must never revive a video superseded while it was loading.
      if (generation !== this.requestGeneration || !this.matches(id, element)) {
        this.stopElement(element);
        return false;
      }
      return true;
    } catch (error) {
      if (this.matches(id, element)) this.active = null;
      throw error;
    }
  }

  pause(id: string, element: HTMLMediaElement) {
    this.stopElement(element);
    if (this.matches(id, element)) {
      this.requestGeneration += 1;
      this.active = null;
    }
  }

  stop(id: string, element: HTMLMediaElement) {
    this.stopElement(element);
    if (this.matches(id, element)) {
      this.requestGeneration += 1;
      this.active = null;
    }
  }

  stopAll() {
    this.requestGeneration += 1;
    for (const element of this.registered.values()) this.stopElement(element);
    this.active = null;
  }

  acceptPlayEvent(id: string, element: HTMLMediaElement) {
    if (!this.active) {
      this.stopEveryElementExcept(element);
      this.active = { id, element };
      return true;
    }
    if (this.matches(id, element)) return true;

    // Covers browser/native-media play events that arrive after a newer request won.
    this.stopElement(element);
    return false;
  }

  setPlaybackRate(id: string, element: HTMLMediaElement, rate: number) {
    if (this.matches(id, element) && !element.paused && !element.ended) element.playbackRate = rate;
  }

  private matches(id: string, element: HTMLMediaElement) {
    return this.active?.id === id && this.active.element === element;
  }

  private stopEveryElementExcept(exception: HTMLMediaElement) {
    for (const element of this.registered.values()) {
      if (element !== exception) this.stopElement(element);
    }
  }

  private stopElement(element: HTMLMediaElement) {
    element.pause();
    element.playbackRate = 1;
  }
}

const playbackController = new PlaybackController();

export function usePlaybackScope(scopeKey: string | null) {
  useEffect(() => {
    // The cleanup runs before React commits a new route/player scope and on app teardown.
    return () => playbackController.stopAll();
  }, [scopeKey]);

  useEffect(() => {
    const stopForBackground = () => {
      if (document.visibilityState === "hidden") playbackController.stopAll();
    };
    const stopForPageExit = () => playbackController.stopAll();
    document.addEventListener("visibilitychange", stopForBackground);
    window.addEventListener("pagehide", stopForPageExit);
    return () => {
      document.removeEventListener("visibilitychange", stopForBackground);
      window.removeEventListener("pagehide", stopForPageExit);
      playbackController.stopAll();
    };
  }, []);
}

export function useManagedPlayback(id: string): {
  element: RefObject<HTMLVideoElement | null>;
  play: () => Promise<boolean>;
  pause: () => void;
  stop: () => void;
  acceptPlayEvent: () => boolean;
  setPlaybackRate: (rate: number) => void;
} {
  const element = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const node = element.current;
    if (!node) return;
    return playbackController.register(id, node);
  }, [id]);

  return {
    element,
    play: async () => {
      const node = element.current;
      return node ? playbackController.play(id, node) : false;
    },
    pause: () => {
      const node = element.current;
      if (node) playbackController.pause(id, node);
    },
    stop: () => {
      const node = element.current;
      if (node) playbackController.stop(id, node);
    },
    acceptPlayEvent: () => {
      const node = element.current;
      return node ? playbackController.acceptPlayEvent(id, node) : false;
    },
    setPlaybackRate: (rate: number) => {
      const node = element.current;
      if (node) playbackController.setPlaybackRate(id, node, rate);
    },
  };
}
