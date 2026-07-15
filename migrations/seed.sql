-- OPTIONAL sample data (the six demo pieces). Run this only if you want the
-- catalog to start populated for a demo; skip it to start with an empty catalog.
-- Safe to run once; INSERT OR IGNORE keeps it from duplicating on re-run.
INSERT OR IGNORE INTO pieces (pid, photo, art_id, descr, artist, medium, art_size, frame, loc, status, archived, created, updated) VALUES
 ('seed-0101','assets/images/art/481133857_1465525504406408_361695882614013422_n.jpg','AP-0101','Lone lion at first light','Deon Stolz','Oil','900 × 600 mm','1010 × 710 × 40 mm','Sunninghill Village','On display',0,1,1),
 ('seed-0102','assets/images/art/481134307_1465525647739727_8130890387216363959_n.jpg','AP-0102','Two lions at a waterhole','Deon Stolz','Oil','1200 × 800 mm','1310 × 910 × 45 mm','Maggies Farm','In stockroom',0,2,2),
 ('seed-0110','assets/images/art/481076952_1467795767512715_7350483388941025729_n.jpg','AP-0110','Yachts under an evening sky','Gaynor','Oil','500 × 500 mm','600 × 600 × 35 mm','ArtPro @ Lifestyle','Sold',0,3,3),
 ('seed-0111','assets/images/art/482268372_1467795534179405_7633487693280745775_n.jpg','AP-0111','Sailboats at the city marina','Gaynor','Oil','760 × 760 mm','860 × 860 × 40 mm','ArtPro @ Lifestyle','On display',0,4,4),
 ('seed-0120','assets/images/artworks/daniel-novela-african-landscape.jpg','AP-0120','African landscape with distant hills','Daniel Novela','Oil','900 × 600 mm','','Prison Break Market','In stockroom',0,5,5),
 ('seed-0130','assets/images/artworks/wakaba-mutheki-musician.jpg','AP-0130','Township musician with trumpet','Wakaba Mutheki','Mixed','400 × 600 mm','500 × 700 × 35 mm','Sunninghill Village','On display',0,6,6);
