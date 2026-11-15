# Layer 1: Base map (approved)

**Product:** `usgs_msl_gale_ortho_25cm_box.tif`. The **USGS MSL Gale Merged Orthophoto Mosaic, 25 cm, v3**: Calef, F.J. III, and Parker, T., 2016, USGS Astrogeology Science Center / PDS Annex.
- **Source file:** https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif (50.4 GB, 180,000 × 280,000 px, uint8, nodata 0).
- **Cut:** the study box plus about 100 m on each side.
- **Grid:** 10,290 × 12,661 px at 0.25 m, on the source's native grid (USGS Gale frame, eqc lon_0 = 0, Mars 2000 sphere), so it was never resampled.
- **Storage:** tiled and DEFLATE-compressed, with internal overviews at 2–32×.
- **Display:** one fixed contrast stretch, 66–194 (the 2nd–98th percentile of the whole box).
- **Checks:** file MD5 d04ddd301f6333ef1bc726ee9b3c3582; pixel MD5 (image values only) 7c2da177f95bd2ebcbd1d0bc80672978; 99.998% of pixels valid (`fetch_log.json`).
- **Not in git:** the file is 113 MB, over GitHub's 100 MB limit. After a clone, run `pipeline/10_fetch_basemap.py`. It uses the same method and checks the pixel MD5.

| File | What |
|---|---|
| `fetch_log.json` | source, pixel window, bytes read (2.28 GB), time (955 s), MD5, stretch, citation |
| `fetch_console.log` | console output of the fetch |
| `docs/preview_box.png` | render of the Layer 1 project |

**Made by:** `../../pipeline/build_history/L1_basemap/20_fetch_basemap_25cm.py`, which reads full-width row bands with HTTP range requests. The source is stored as 1-row strips. The Layer 1 project is `21_qgis_project.py`.

**Used for:** the backdrop in QGIS and the photo texture of the 3D terrain. It has no GO/NO-GO role, because a photo has no hazard value of its own.

**Replaced:** the earlier 4-strip version from the teammate's nasa_data pipeline. Each strip had its own stretch, which caused banding, and the strips were resampled to lon/lat (`../../docs/history/L1_README_original.md`).

**Limits:** greyscale only. It shows the surface at the time of imaging.
