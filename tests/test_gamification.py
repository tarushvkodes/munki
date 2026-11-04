from app import gamification as G

def test_xp_never_zero():
    assert G.xp_for("again", 0) == 5
    assert G.xp_for("knew", 1) == 10

def test_combo_multipliers():
    assert G.combo_multiplier(4) == 1 and G.combo_multiplier(5) == 2
    assert G.combo_multiplier(10) == 3 and G.combo_multiplier(20) == 5
    assert G.xp_for("knew", 5) == 20 and G.xp_for("knew", 10) == 30 and G.xp_for("knew", 20) == 50

def test_critical_doubles():
    assert G.xp_for("knew", 1, critical=True) == 20
    hits = sum(G.is_critical(i, "2026-11-02", i) for i in range(1200))
    assert 50 < hits < 160  # ~1 in 12

def test_levels():
    assert G.level_for_xp(0)[0] == 1
    assert G.level_for_xp(100)[0] == 2
    assert G.level_for_xp(300)[0] == 3

def test_quests_deterministic_three():
    a, b = G.quests_for("2026-11-02"), G.quests_for("2026-11-02")
    assert a == b and len(a) == 3 and len({q["key"] for q in a}) == 3

def test_forgiving_streak():
    days = {"2026-10-31", "2026-11-01"}
    assert G.streak(days, "2026-11-02") == 2  # today empty doesn't break it
    assert G.streak(days | {"2026-11-02"}, "2026-11-02") == 3
    assert G.streak(set(), "2026-11-02") == 0
