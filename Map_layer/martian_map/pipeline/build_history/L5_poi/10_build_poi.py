"""Layer 5 - Points of interest: build from a curated, sourced catalogue.

Positions: for rover events, the NASA MMGIS waypoint of the last drive with
sol <= event sol (rover parked there during the event). These coordinates are
native to the USGS MSL Gale mosaic frame (see ../METADATA.md section D).
IAU names: USGS/IAU Gazetteer centre points (regional labels only).
Team EVA stops: Depo_nasa Ai_model/results/stops_v2.json (team AI on Navcam).

Outputs:
  derived/layer5_poi.gpkg   layers: poi (points), eva_stops (points), surface_view_sites (polygons)
  exports/poi_gale.geojson, exports/poi_box.geojson, exports/eva_stops.geojson, exports/poi_cards.json
Run: ../.venv/Scripts/python.exe -I scripts/10_build_poi.py   (from layer5_poi/)
"""
import os, json, bisect, datetime as dt
import geopandas as gpd
from shapely.geometry import Point, shape

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
WP = os.path.join(ROOT, "data", "raw", "geology", "rover", "MSL_waypoints.json")
GAZ = os.path.join(HERE, "raw", "iau_gazetteer", "MARS_nomenclature_center_pts.shp")
SURF = os.path.join(HERE, "raw", "probe_MSL_SurfaceSites.json")
STOPS = r"C:\Users\pc\Desktop\Depo_nasa\Ai_model\results\stops_v2.json"
CRS = "+proj=longlat +R=3396190 +no_defs"
BOX = (137.36, -4.83, 137.40, -4.78)
TODAY = dt.date.today().isoformat()
WP_URL = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json"

# ---------------- curated catalogue (every fact from the URL given) ----------------
# unc_m = ASSUMED position uncertainty: arm targets (drill/APXS) 5 m; mast/remote or area 25-100 m.
CAT = [
 dict(name="Bradbury Landing", name_status="NASA_informal", category="landing_site", sol=0, wp_sol=0, unc_m=10,
      evidence="observed", src="NASA/JPL news: NASA Mars Rover Begins Driving at Bradbury Landing (Aug 2012)",
      url="https://www.jpl.nasa.gov/news/nasa-mars-rover-begins-driving-at-bradbury-landing/", cls="NASA",
      desc="Curiosity's landing site inside Gale crater (5 Aug 2012 PDT), named by NASA after author Ray Bradbury. Position = first rover waypoint, before the first drive.",
      why="Start of the mission; reference point for the whole traverse."),
 dict(name="John Klein (first drill hole)", name_status="NASA_informal", category="drill_site", sol=182, wp_sol=182, unc_m=5,
      evidence="observed", src="NASA/JPL: NASA Curiosity Rover Collects First Martian Bedrock Sample",
      url="https://www.jpl.nasa.gov/news/nasa-curiosity-rover-collects-first-martian-bedrock-sample/", cls="NASA",
      desc="First rock drilled on Mars (sol 182, 8 Feb 2013) in Sheepbed mudstone, Yellowknife Bay. CheMin and SAM results pointed to an ancient wet environment that could have supported microbes.",
      why="First evidence of a habitable ancient environment in Gale."),
 dict(name="Hidden Valley (sand hazard)", name_status="NASA_informal", category="hazard_lesson", sol=709, sol_end=719, wp_sol=709, unc_m=100,
      evidence="observed", src="NASA/JPL news release 2014-279; NASA image 'Curiosity Tracks in Hidden Valley' (sol 709)",
      url="https://mars.nasa.gov/resources/6493/curiosity-tracks-in-hidden-valley-on-mars/", cls="NASA",
      desc="Sandy valley floor where wheels slipped more than expected in Aug 2014 (Navcam sol 709); the team reversed and drove out to the northeast.",
      why="Real lesson for route planning: sand-filled lows are a mobility hazard."),
 dict(name="Elemental sulfur discovery (Gediz Vallis channel)", name_status="NASA_informal", category="discovery", sol=4200, wp_sol=4200, unc_m=25,
      evidence="observed", src="NASA/JPL: NASA's Curiosity Rover Discovers a Surprise in a Martian Rock (2024)",
      url="https://www.jpl.nasa.gov/news/nasas-curiosity-rover-discovers-a-surprise-in-a-martian-rock/", cls="NASA",
      desc="On 30 May 2024 the rover drove over and cracked a rock, revealing yellow crystals identified as elemental sulfur, the first found on Mars. Sol ~4200 is ESTIMATED (NASA gives 'Snow Lake' close-up on sol 4209 = 8 June, nine days later).",
      why="First pure sulfur on Mars; shows the channel's unusual chemistry."),
 dict(name="Sulfate unit to boxwork contact", name_status="team", category="discovery", sol=4534, wp_sol=4534, unc_m=25,
      evidence="observed", src="Siebach et al., GSA 2025 abstract (per SESSION_HANDOFF.md); NASA blog sols 4804-4811 (boxwork Phase 1 began sol 4534)",
      url="https://science.nasa.gov/blog/curiosity-blog-sols-4804-4811-kicking-off-the-final-phase-of-boxwork-exploration", cls="NASA",
      desc="Where Curiosity left the layered sulfate unit and entered the boxwork region (sol 4534). NASA's blog dates boxwork campaign Phase 1 to sols 4534-4570. GSA 2025 abstract URL to be added (not verified here).",
      why="Key geologic boundary; start of the boxwork campaign and of our EVA box route."),
 dict(name="Altadena (first boxwork drill)", name_status="NASA_informal", category="drill_site", sol=4564, wp_sol=4564, unc_m=5,
      evidence="observed", src="NASA/JPL: NASA's Curiosity Mars Rover Starts Unpacking Boxwork Formations (23 Jun 2025); blog sols 4563-4565",
      url="https://www.nasa.gov/missions/mars-science-laboratory/curiosity-rover/nasas-curiosity-mars-rover-starts-unpacking-boxwork-formations/", cls="NASA",
      desc="First drill sample of the boxwork campaign, on a ridge edge, June 2025. Drill sol 4564 is INFERRED (blog: drilling on the second sol of the 4563-4565 plan; post-brush image sol 4561).",
      why="Baseline composition of boxwork bedrock."),
 dict(name="Monte Grande (boxwork hollow)", name_status="NASA_informal", category="science_target", sol=4693, wp_sol=4693, unc_m=25,
      evidence="observed", src="NASA blog: Curiosity Blog, Sols 4695-4701: Searching for Answers at Monte Grande",
      url="https://science.nasa.gov/blog/curiosity-blog-sols-4695-4701-searching-for-answers-at-monte-grande/", cls="NASA",
      desc="Boxwork hollow studied in Oct 2025; Mastcam mosaics of its walls. Hollow drill target Valle de la Luna lies here.",
      why="Example of a boxwork hollow: compare with ridges for how boxwork formed."),
 dict(name="Valle de la Luna (44th drill hole)", name_status="NASA_informal", category="drill_site", sol=4693, wp_sol=4693, unc_m=5,
      evidence="observed", src="NASA blogs: Sols 4689-4694 'Drill in the Boxwork Unit is GO!' and Sols 4695-4701 (44th hole)",
      url="https://science.nasa.gov/blog/curiosity-blog-sols-4689-4694-drill-in-the-boxwork-unit-is-go/", cls="NASA",
      desc="Drill target in the Monte Grande hollow, drilled around 18-19 Oct 2025 (Mastcam image of the hole on sol 4693); Curiosity's 44th hole. Exact drill sol not stated.",
      why="Hollow sample for the ridge-vs-hollow comparison."),
 dict(name="Nevado Sajama (ridge-top drill)", name_status="NASA_informal", category="drill_site", sol=4718, wp_sol=4718, unc_m=5,
      evidence="observed", src="NASA blog: Curiosity Blog, Sols 4716-4722: Drilling Success at Nevado Sajama",
      url="https://science.nasa.gov/blog/curiosity-blog-sols-4716-4722-drilling-success-at-nevado-sajama/", cls="NASA",
      desc="Ridge-top drill target; drilling completed on sol 4718 (13 Nov 2025) after APXS, ChemCam and MAHLI checks.",
      why="Ridge sample for the ridge-vs-hollow comparison."),
 dict(name="Nevado Sajama 2 (second ridge drill)", name_status="NASA_informal", category="drill_site", sol=4803, wp_sol=4803, unc_m=5,
      evidence="observed", src="NASA blog: Curiosity Blog Sols 4804-4811: Kicking Off the Final Phase of Boxwork Exploration",
      url="https://science.nasa.gov/blog/curiosity-blog-sols-4804-4811-kicking-off-the-final-phase-of-boxwork-exploration", cls="NASA",
      desc="Second drill at Nevado Sajama; MAHLI image sol 4803 (9 Feb 2026); final activities completed that week before the last boxwork phase.",
      why="Repeat sample at the same ridge site."),
 dict(name="Nazca (49th drill hole)", name_status="NASA_informal", category="drill_site", sol=5050, sol_end=5055, wp_sol=5050, unc_m=25,
      evidence="observed", src="NASA blog title 'Curiosity Blog, Sols 5050-5055: It's Nazca, Our 49th Drill Hole' (title seen in site sidebar; page NOT read)",
      url="https://science.nasa.gov/blog/curiosity-blog-sols-5050-5055-its-nazca-our-49th-drill-hole/", cls="NASA",
      desc="49th drill hole, sols 5050-5055 per the NASA blog title. Details NOT verified (page not read); position = rover waypoint at sol 5050.",
      why="Bedrock sample just above the boxwork (per a later blog, to verify)."),
 dict(name="Curiosity position, sol 5073 (latest in data)", name_status="team", category="rover_position", sol=5073, wp_sol=5073, unc_m=5,
      evidence="observed", src="NASA MMGIS MSL waypoints (latest in our download)", url=WP_URL, cls="official_NASA_list",
      desc="Last waypoint in the waypoint file downloaded 14 Nov 2026 (sol 5073). Not live.",
      why="Where the rover was most recently, per our data."),
]

def load_waypoints():
    f = json.load(open(WP))["features"]
    w = sorted((x["properties"]["sol"], x["properties"]["lon"], x["properties"]["lat"], x["properties"]["site"],
                x["properties"]["drive"], x["properties"].get("elev_geoid")) for x in f)
    return w, [a[0] for a in w]

def pos(w, sols, s):
    i = max(bisect.bisect_right(sols, s) - 1, 0); return w[i]

def scale_of(lon, lat):
    return "box" if BOX[0] <= lon <= BOX[2] and BOX[1] <= lat <= BOX[3] else "gale"

w, sols = load_waypoints()
rows = []
for n, c in enumerate(CAT, 1):
    s, lon, lat, site, drive, elev = pos(w, sols, c["wp_sol"])
    rows.append(dict(poi_id=f"L5-{n:04d}", name=c["name"], name_status=c["name_status"], category=c["category"],
                     scale=scale_of(lon, lat), sol=c["sol"], sol_end=c.get("sol_end"), lon=lon, lat=lat,
                     position_method="rover_waypoint_on_sol", position_note=f"waypoint sol {s}, site {site}, drive {drive}",
                     position_uncertainty_m=c["unc_m"], elev_m_usgs=elev, evidence=c["evidence"], source_name=c["src"],
                     source_url=c["url"], source_class=c["cls"], position_source_url=WP_URL, description=c["desc"],
                     science_value=c["why"], image_url=None, retrieved=TODAY, geometry=Point(lon, lat)))

# IAU names (regional labels): Gale-wide extent
g = gpd.read_file(GAZ)
g = g[(g.center_lon.between(136.2, 139.4)) & (g.center_lat.between(-7.0, -3.8))]
for _, r in g.iterrows():
    n += 1
    rows.append(dict(poi_id=f"L5-{n:04d}", name=r["name"], name_status="IAU", category="named_feature", scale="gale",
                     sol=None, sol_end=None, lon=float(r.center_lon), lat=float(r.center_lat), position_method="published_coord",
                     position_note=f"IAU feature centre; type {r['type']}; diameter {r.diameter:.3f} km",
                     position_uncertainty_m=None, elev_m_usgs=None, evidence="inferred", source_name="USGS/IAU Gazetteer of Planetary Nomenclature",
                     source_url=r["link"], source_class="USGS", position_source_url="https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.zip",
                     description=f"IAU-approved {r['type'].split(',')[0].lower()} name (approved {str(r.approvaldt)[:10]}), {r.diameter:.1f} km across. Label position from the gazetteer (older MDIM/THEMIS control; km-scale only).",
                     science_value="Official place name for maps and the assistant.", image_url=None, retrieved=TODAY,
                     geometry=Point(float(r.center_lon), float(r.center_lat))))

poi = gpd.GeoDataFrame(rows, crs=CRS)

# NASA Surface View sites (polygons) as-is
sv = json.load(open(SURF))["features"]
svg = gpd.GeoDataFrame([dict(name=x["properties"]["Name"], site=x["properties"]["site"], category="panorama",
                             source_name="NASA Curiosity location map, Surface View layer",
                             source_url="https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_SurfaceSites.json",
                             source_class="NASA", geometry=shape(x["geometry"])) for x in sv], crs=CRS)

# Team EVA stops (AI on Navcam), positions = waypoints
st = json.load(open(STOPS))
eva = gpd.GeoDataFrame([dict(stop_no=i + 1, sol=s["sol"], soil_pct=s["soil_pct"], bedrock_pct=s["bedrock_pct"], sand_pct=s["sand_pct"],
                             bigrock_pct=s["bigrock_pct"], image=s["image"], note=s["note"], category="eva_stop",
                             source_name="Team AI (Depo_nasa Ai_model stops_v2.json) on NASA Navcam images",
                             source_url="https://github.com/malek-mejaouel/Depo_nasa/blob/main/Ai_model/results/stops_v2.json",
                             source_class="team", geometry=Point(s["lon"], s["lat"])) for i, s in enumerate(st)], crs=CRS)

out = os.path.join(HERE, "derived", "layer5_poi.gpkg")
if os.path.exists(out): os.remove(out)
poi.to_file(out, layer="poi", driver="GPKG"); eva.to_file(out, layer="eva_stops", driver="GPKG"); svg.to_file(out, layer="surface_view_sites", driver="GPKG")

EX = os.path.join(HERE, "exports")
note = "Coordinates: planetocentric lon/lat, east-positive, Mars sphere R=3396190 (NOT Earth WGS84). Frame: USGS MSL Gale mosaic frame."
for sc in ("gale", "box"):
    sub = poi if sc == "gale" else poi[poi["scale"] == "box"]  # Gale-wide view shows everything
    gj = json.loads(sub.to_json(na="null")); gj["crs_note"] = note
    json.dump(gj, open(os.path.join(EX, f"poi_{sc}.geojson"), "w"), indent=1)
gj = json.loads(eva.to_json(na="null")); gj["crs_note"] = note; json.dump(gj, open(os.path.join(EX, "eva_stops.geojson"), "w"), indent=1)
cards = [dict(id=r.poi_id, title=r["name"], category=r.category, scale=r["scale"], sol=None if r.sol != r.sol else r.sol,
              lon=r.lon, lat=r.lat, what=r.description, why=r.science_value, evidence=r.evidence,
              position=f"{r.position_method} (+/- {r.position_uncertainty_m} m, ASSUMED)" if r.position_uncertainty_m == r.position_uncertainty_m and r.position_uncertainty_m is not None else r.position_method,
              source={"name": r.source_name, "url": r.source_url, "class": r.source_class}) for _, r in poi.iterrows() if r.category != "named_feature"]
json.dump({"crs_note": note, "cards": cards}, open(os.path.join(EX, "poi_cards.json"), "w"), indent=1, default=str)
print(poi[["poi_id", "name", "category", "scale", "sol", "lon", "lat"]].to_string())
print("eva_stops", len(eva), "surface_view_sites", len(svg))
