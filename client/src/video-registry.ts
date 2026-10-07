import video0 from "./assets/videos/phys172-exam2/energy-principle-short.mp4";
import video1 from "./assets/videos/phys172-exam2/work-short.mp4";
import video2 from "./assets/videos/phys172-exam2/conservative-short.mp4";
import video3 from "./assets/videos/lesson15/short.mp4";
import video4 from "./assets/videos/lesson15/explainer.mp4";
import video5 from "./assets/videos/lesson16/short.mp4";
import video6 from "./assets/videos/lesson16/explainer.mp4";
import video7 from "./assets/videos/phys172-exam2/energy-explainer.mp4";
import video8 from "./assets/videos/lesson17/short.mp4";
import video9 from "./assets/videos/lesson17/explainer.mp4";
import video10 from "./assets/videos/lesson18/short.mp4";
import video11 from "./assets/videos/lesson18/explainer.mp4";
import video12 from "./assets/videos/lesson19/short.mp4";
import video13 from "./assets/videos/lesson19/explainer.mp4";
import video14 from "./assets/videos/exam2-review/series-short.mp4";
import video15 from "./assets/videos/exam2-review/strategy-short.mp4";
import video16 from "./assets/videos/exam2-review/exam2-explainer.mp4";

export type LessonVideo = {
  id: string;
  lesson: number;
  className: "MA 162" | "PHYS 172";
  scopeLabel: string;
  topic: string;
  title: string;
  format: "Short" | "Explainer";
  durationSeconds: number;
  xp: number;
  targetAssessment: string;
  assessmentDate: string;
  sealed: boolean;
  source: string;
};

// Bun emits imported media as a document-relative "./assets/..." string. The
// Muse shell can mount the document at a rewritten route, so resolving that
// string from the document can point outside this artifact. Resolve the emitted
// filename from this module's own URL instead; the module and videos are sibling
// files in the shipped assets directory.
function bundledVideoUrl(asset: string) {
  const filename = asset.split("/").pop();
  if (!filename) return asset;
  return new URL(filename, import.meta.url).href;
}

// Generated from client/video-manifest.json. Sealed entries are omitted.
const lessonVideoManifest: LessonVideo[] = [
  {"id":"phys172-exam2-energy-principle-short","lesson":11,"className":"PHYS 172","scopeLabel":"LEC 11–16","topic":"Energy Principle · system choice and bookkeeping","title":"The Energy Principle in one line","format":"Short","durationSeconds":82.706,"xp":35,"targetAssessment":"PHYS 172 Exam 2","assessmentDate":"2026-10-28T20:00:00-04:00","sealed":false, "source": video0 },
  {"id":"phys172-exam2-work-short","lesson":12,"className":"PHYS 172","scopeLabel":"LEC 11–16","topic":"Work as a dot product","title":"Work only counts along the motion","format":"Short","durationSeconds":84.362,"xp":35,"targetAssessment":"PHYS 172 Exam 2","assessmentDate":"2026-10-28T20:00:00-04:00","sealed":false, "source": video1 },
  {"id":"phys172-exam2-conservative-short","lesson":13,"className":"PHYS 172","scopeLabel":"LEC 11–16","topic":"Conservative and nonconservative forces","title":"Where potential energy comes from","format":"Short","durationSeconds":86.594,"xp":35,"targetAssessment":"PHYS 172 Exam 2","assessmentDate":"2026-10-28T20:00:00-04:00","sealed":false, "source": video2 },
  {"id":"lesson15-short","lesson":15,"className":"MA 162","scopeLabel":"Lesson 15","topic":"Trig substitution, Part II (§8.4)","title":"Trig sub pattern reflex","format":"Short","durationSeconds":57.7,"xp":35,"targetAssessment":"MA 162 Quiz 5","assessmentDate":"2026-10-08T23:59:00-04:00","sealed":false, "source": video3 },
  {"id":"lesson15-explainer","lesson":15,"className":"MA 162","scopeLabel":"Lesson 15","topic":"Trig substitution, Part II (§8.4)","title":"Why trig sub works","format":"Explainer","durationSeconds":215,"xp":55,"targetAssessment":"MA 162 Quiz 5","assessmentDate":"2026-10-08T23:59:00-04:00","sealed":false, "source": video4 },
  {"id":"lesson16-short","lesson":16,"className":"MA 162","scopeLabel":"Lesson 16","topic":"Partial fractions, Part I (§8.5)","title":"Cover-up method","format":"Short","durationSeconds":57.8,"xp":35,"targetAssessment":"MA 162 Quiz 5","assessmentDate":"2026-10-08T23:59:00-04:00","sealed":false, "source": video5 },
  {"id":"lesson16-explainer","lesson":16,"className":"MA 162","scopeLabel":"Lesson 16","topic":"Partial fractions, Part I (§8.5)","title":"Where partial fractions come from","format":"Explainer","durationSeconds":184,"xp":55,"targetAssessment":"MA 162 Quiz 5","assessmentDate":"2026-10-08T23:59:00-04:00","sealed":false, "source": video6 },
  {"id":"phys172-exam2-energy-explainer","lesson":16,"className":"PHYS 172","scopeLabel":"LEC 11–16","topic":"Energy Principle · work, kinetic energy, and potential energy","title":"Energy: the full accounting system","format":"Explainer","durationSeconds":208.826,"xp":55,"targetAssessment":"PHYS 172 Exam 2","assessmentDate":"2026-10-28T20:00:00-04:00","sealed":false, "source": video7 },
  {"id":"lesson17-short","lesson":17,"className":"MA 162","scopeLabel":"Lesson 17","topic":"Partial fractions, Part II (§8.5–§8.6 strategy)","title":"Pick the weapon strategy drill","format":"Short","durationSeconds":58.5,"xp":35,"targetAssessment":"MA 162 Quiz 5","assessmentDate":"2026-10-08T23:59:00-04:00","sealed":false, "source": video8 },
  {"id":"lesson17-explainer","lesson":17,"className":"MA 162","scopeLabel":"Lesson 17","topic":"Partial fractions, Part II (§8.5–§8.6 strategy)","title":"Irreducible quadratics + strategy","format":"Explainer","durationSeconds":176,"xp":55,"targetAssessment":"MA 162 Quiz 5","assessmentDate":"2026-10-08T23:59:00-04:00","sealed":false, "source": video9 },
  {"id":"lesson18-short","lesson":18,"className":"MA 162","scopeLabel":"Lesson 18","topic":"Improper integrals (§8.9)","title":"Two improper-integral moves","format":"Short","durationSeconds":79.154,"xp":35,"targetAssessment":"MA 162 Quiz 6","assessmentDate":"2026-10-15","sealed":false, "source": video10 },
  {"id":"lesson18-explainer","lesson":18,"className":"MA 162","scopeLabel":"Lesson 18","topic":"Improper integrals (§8.9)","title":"Improper integrals: limits, blow-ups, and the p-test","format":"Explainer","durationSeconds":238.034,"xp":55,"targetAssessment":"MA 162 Quiz 6","assessmentDate":"2026-10-15","sealed":false, "source": video11 },
  {"id":"lesson19-short","lesson":19,"className":"MA 162","scopeLabel":"Lesson 19","topic":"Sequences and series overview (§10.1)","title":"A series is a sequence in disguise","format":"Short","durationSeconds":93.914,"xp":35,"targetAssessment":"MA 162 Quiz 6","assessmentDate":"2026-10-15","sealed":false, "source": video12 },
  {"id":"lesson19-explainer","lesson":19,"className":"MA 162","scopeLabel":"Lesson 19","topic":"Sequences and series overview (§10.1)","title":"Sequences, series, and partial sums","format":"Explainer","durationSeconds":224.762,"xp":55,"targetAssessment":"MA 162 Quiz 6","assessmentDate":"2026-10-15","sealed":false, "source": video13 },
  {"id":"exam2-review-series-short","lesson":20,"className":"MA 162","scopeLabel":"Lessons 12–20","topic":"Exam 2 series decision tree","title":"Series test decision tree","format":"Short","durationSeconds":79.442,"xp":35,"targetAssessment":"MA 162 Exam 2","assessmentDate":"2026-10-20T20:00:00-04:00","sealed":false, "source": video14 },
  {"id":"exam2-review-strategy-short","lesson":20,"className":"MA 162","scopeLabel":"Lessons 12–20","topic":"Exam 2 integration-method strategy","title":"Pick the integration weapon","format":"Short","durationSeconds":82.178,"xp":35,"targetAssessment":"MA 162 Exam 2","assessmentDate":"2026-10-20T20:00:00-04:00","sealed":false, "source": video15 },
  {"id":"exam2-review-exam2-explainer","lesson":20,"className":"MA 162","scopeLabel":"Lessons 12–20","topic":"Exam 2 comprehensive review","title":"Exam 2 strategy playbook","format":"Explainer","durationSeconds":252.17,"xp":55,"targetAssessment":"MA 162 Exam 2","assessmentDate":"2026-10-20T20:00:00-04:00","sealed":false, "source": video16 },
];

export const lessonVideos: LessonVideo[] = lessonVideoManifest.map((video) => ({
  ...video,
  source: bundledVideoUrl(video.source),
}));
