"""'Analog in time': how many hours per day the Sun sits low (0–7°) at an Earth latitude, by month.
At the lunar south pole the Sun never rises more than ~7° above the horizon."""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import math
import numpy as np


def solar_elevation(lat_deg, day_of_year, hours):
    lat = math.radians(lat_deg)
    dec = math.radians(23.44) * math.sin(2 * math.pi * (284 + day_of_year) / 365)
    hang = np.radians((np.asarray(hours) - 12) * 15)
    return np.degrees(np.arcsin(np.sin(lat) * np.sin(dec) + np.cos(lat) * np.cos(dec) * np.cos(hang)))


def low_sun_hours_by_month(lat_deg, emin=0.0, emax=7.0, step_h=0.05):
    hrs = np.arange(0, 24, step_h)
    out = []
    for m in range(12):
        days = range(int(m * 30.4) + 1, int((m + 1) * 30.4) + 1)
        hs = [((e >= emin) & (e <= emax)).sum() * step_h for e in (solar_elevation(lat_deg, n, hrs) for n in days)]
        out.append(float(np.mean(hs)))
    return out
