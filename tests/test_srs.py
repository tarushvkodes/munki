from app import srs

def st(**kw):
    base = srs.new_state("2026-11-02"); base.update(kw); return base

def test_first_knew_interval_1():
    s = srs.apply_review(st(), "knew", "2026-11-02")
    assert s["repetitions"] == 1 and s["interval_days"] == 1 and s["due_date"] == "2026-11-03"

def test_second_knew_interval_6():
    s = srs.apply_review(st(repetitions=1, interval_days=1), "knew", "2026-11-03")
    assert s["repetitions"] == 2 and s["interval_days"] == 6 and s["due_date"] == "2026-11-09"

def test_third_knew_scales_by_ease():
    s = srs.apply_review(st(repetitions=2, interval_days=6, ease=2.5), "knew", "2026-11-09")
    assert s["repetitions"] == 3 and s["interval_days"] == round(6 * 2.6)  # ease rises to 2.6 on q=5
    assert s["ease"] == 2.6

def test_again_resets_and_counts_lapse():
    s = srs.apply_review(st(repetitions=4, interval_days=30, ease=2.5), "again", "2026-11-02")
    assert s["repetitions"] == 0 and s["interval_days"] == 1 and s["lapses"] == 1
    assert s["due_date"] == "2026-11-03"

def test_ease_floor():
    s = st(ease=1.3)
    for _ in range(5):
        s = srs.apply_review(s, "again", "2026-11-02")
    assert s["ease"] >= 1.3

def test_ease_drops_on_again():
    s = srs.apply_review(st(ease=2.5), "again", "2026-11-02")
    assert s["ease"] < 2.5

def test_bad_grade_rejected():
    import pytest
    with pytest.raises(ValueError):
        srs.apply_review(st(), "sorta", "2026-11-02")

def test_mature_threshold():
    assert srs.is_mature(st(repetitions=3, interval_days=21))
    assert not srs.is_mature(st(repetitions=3, interval_days=20))
    assert not srs.is_mature(st(repetitions=0, interval_days=30))
