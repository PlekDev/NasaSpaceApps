# AI-assisted (Claude, Anthropic); reviewed by the team.
import math
import numpy as np
import pytest
from pen.shadows import cast_shadow
from pen.scoring import similarity, iqr_scale
from pen.sun import low_sun_hours_by_month, solar_elevation


@pytest.fixture
def block():
    z = np.zeros((200, 200), np.float32)
    z[95:105, 95:105] = 100.0  # 300 m wide, 100 m tall block on a 30 m grid
    return z


EXPECTED_LEN = 100 / math.tan(math.radians(5)) / 30  # ≈ 38 px


@pytest.mark.parametrize("az, dr, dc", [(270, 0, 1), (90, 0, -1), (0, 1, 0), (180, -1, 0),
                                        (225, -1, 1), (45, 1, -1), (315, 1, 1), (135, -1, -1)])
def test_shadow_falls_opposite_to_sun(block, az, dr, dc):
    sh = cast_shadow(block, 5, az)
    ys, xs = np.where(sh)
    cy, cx = ys.mean() - 99.5, xs.mean() - 99.5
    assert np.sign(round(cy)) == dr and np.sign(round(cx)) == dc
    # nothing leaks to the image borders
    assert not sh[:3].any() and not sh[-3:].any() and not sh[:, :3].any() and not sh[:, -3:].any()


def test_shadow_length_cardinal(block):
    sh = cast_shadow(block, 5, 270)
    cols = np.where(sh.any(axis=0))[0]
    assert abs((cols.max() - 104) - EXPECTED_LEN) <= 2


def test_flat_terrain_has_no_shadow():
    assert not cast_shadow(np.zeros((50, 50), np.float32), 2, 225).any()


def test_nodata_is_never_shadow(block):
    z = block.copy(); z[:, :20] = np.nan
    assert not cast_shadow(z, 3, 90)[:, :20].any()


def test_similarity_identity_and_monotonic():
    ref = {"a": 1.0, "b": 2.0}
    scale = {"a": 1.0, "b": 1.0}
    s_same, _ = similarity(ref, ref, ["a", "b"], scale)
    s_near, _ = similarity({"a": 1.5, "b": 2.0}, ref, ["a", "b"], scale)
    s_far, _ = similarity({"a": 3.0, "b": 2.0}, ref, ["a", "b"], scale)
    assert s_same == pytest.approx(100) and s_same > s_near > s_far


def test_iqr_scale_positive():
    pool = [{"a": x} for x in range(10)]
    assert iqr_scale(pool, ["a"])["a"] > 0


def test_low_sun_hours_shapes():
    tropics, arctic = low_sun_hours_by_month(31.5), low_sun_hours_by_month(75.5)
    assert len(tropics) == 12 and 0.8 < np.mean(tropics) < 1.6
    assert max(arctic) > 4 and arctic[5] == 0  # June: midnight Sun stays above 7° at 75.5°N


def test_solar_noon_equinox_equator():
    assert solar_elevation(0, 80, [12])[0] == pytest.approx(90, abs=2)
