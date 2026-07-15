<?php
/**
 * Template Name: Interactive Virtual Gallery
 *
 * A highly interactive, visually immersive "Virtual Art Gallery" landing
 * experience for ArtPro Gallery. Images are pulled live from the WordPress
 * Media Library via WP_Query and rendered inside a futuristic, layered,
 * glassmorphic UI with mouse-parallax depth.
 *
 * Drop this file into your active (child) theme folder, then create a Page
 * in wp-admin and assign the "Interactive Virtual Gallery" template to it.
 *
 * Self-contained: all PHP, HTML, CSS and JS live in this single file so it can
 * be uploaded directly. No build step, no external JS dependencies.
 *
 * @package ArtPro
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // No direct file access.
}

/* -------------------------------------------------------------------------
 * 1. FETCH IMAGES FROM THE WORDPRESS MEDIA LIBRARY
 * -------------------------------------------------------------------------
 * We query attachments of mime-type image/* and build a clean array of
 * { url, thumb, title, caption, artist }. This array is later serialized to
 * JSON and injected into a JS variable so the front-end can consume it
 * without an AJAX round-trip.
 * ---------------------------------------------------------------------- */

$artpro_gallery_images = array();

$artpro_query = new WP_Query(
	array(
		'post_type'      => 'attachment',
		'post_mime_type' => 'image',
		'post_status'    => 'inherit',
		'posts_per_page' => 24,             // Latest 24 images; tune as needed.
		'orderby'        => 'date',
		'order'          => 'DESC',
		'no_found_rows'  => true,           // Micro-optimisation: skip pagination count.
	)
);

if ( $artpro_query->have_posts() ) {
	while ( $artpro_query->have_posts() ) {
		$artpro_query->the_post();

		$att_id  = get_the_ID();
		$full    = wp_get_attachment_image_src( $att_id, 'large' );
		$thumb   = wp_get_attachment_image_src( $att_id, 'medium' );
		$caption = wp_get_attachment_caption( $att_id );

		if ( ! $full ) {
			continue; // Skip anything that failed to resolve a URL.
		}

		$artpro_gallery_images[] = array(
			'url'     => esc_url_raw( $full[0] ),
			'thumb'   => esc_url_raw( $thumb ? $thumb[0] : $full[0] ),
			'title'   => wp_strip_all_tags( get_the_title() ),
			'caption' => wp_strip_all_tags( $caption ),
			// Media Library has no native "artist" field, so we read an optional
			// custom field `_artpro_artist`; falls back gracefully to empty.
			'artist'  => wp_strip_all_tags( (string) get_post_meta( $att_id, '_artpro_artist', true ) ),
		);
	}
	wp_reset_postdata();
}

/*
 * Fallback demo data — guarantees the experience renders even on a brand-new
 * site with an empty Media Library. Uses the theme's bundled assets so nothing
 * is broken on first load. Remove or keep as a graceful degradation layer.
 */
if ( empty( $artpro_gallery_images ) ) {
	$uri = get_stylesheet_directory_uri();
	$artpro_gallery_images = array(
		array( 'url' => $uri . '/assets/images/img-abstract.jpg',       'thumb' => $uri . '/assets/images/img-abstract.jpg',       'title' => 'Untitled (Abstract)', 'caption' => 'Acrylic on canvas', 'artist' => 'Various artists' ),
		array( 'url' => $uri . '/assets/images/img-vintage-carscene.jpg','thumb' => $uri . '/assets/images/img-vintage-carscene.jpg','title' => 'Vintage Car Scene',    'caption' => 'Oil on board',       'artist' => 'Various artists' ),
		array( 'url' => $uri . '/assets/images/svc-oil.jpg',            'thumb' => $uri . '/assets/images/svc-oil.jpg',            'title' => 'Study in Oil',        'caption' => 'Oil',                'artist' => 'Various artists' ),
		array( 'url' => $uri . '/assets/images/svc-watercolour.jpg',    'thumb' => $uri . '/assets/images/svc-watercolour.jpg',    'title' => 'Watercolour No. 3',   'caption' => 'Watercolour',        'artist' => 'Various artists' ),
		array( 'url' => $uri . '/assets/images/svc-charcoal.jpg',       'thumb' => $uri . '/assets/images/svc-charcoal.jpg',       'title' => 'Charcoal Portrait',   'caption' => 'Charcoal on paper',  'artist' => 'Various artists' ),
		array( 'url' => $uri . '/assets/images/svc-linocut.jpg',        'thumb' => $uri . '/assets/images/svc-linocut.jpg',        'title' => 'Linocut Print',       'caption' => 'Linocut',            'artist' => 'Various artists' ),
	);
}

get_header();
?>

<!-- =====================================================================
     2. SEMANTIC HTML5 STRUCTURE
     ================================================================== -->
<main id="artpro-vg" class="gallery-canvas" role="main" aria-label="Interactive virtual gallery">

	<!-- Ambient gallery environment (absolute background layer) -->
	<div class="vg-environment" aria-hidden="true">
		<div class="vg-floor"></div>
		<div class="vg-wall"></div>
		<div class="vg-spotlight"></div>
		<!-- Soft drifting orbs add subtle depth to the neutral space -->
		<span class="vg-orb vg-orb--a"></span>
		<span class="vg-orb vg-orb--b"></span>
	</div>

	<!-- Central 3D focal point — the "virtual plinth" holding the active piece -->
	<section class="central-focal-point" data-depth="1.0" aria-live="polite">
		<div class="vg-frame">
			<img class="vg-active-img" src="" alt="" decoding="async">
			<button class="vg-expand" type="button" aria-label="View fullscreen" data-action="lightbox">
				<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 9V4h5M20 15v5h-5M20 9V4h-5M4 15v5h5"/></svg>
			</button>
			<div class="vg-frame__plate">
				<span class="vg-frame__title">—</span>
				<span class="vg-frame__meta">—</span>
			</div>
		</div>

		<!-- Floating navigation overlay, layered over the central piece -->
		<nav class="vg-floating-nav" aria-label="Gallery sections">
			<a href="#" class="vg-floating-nav__item" data-action="lightbox">The&nbsp;Spaces</a>
			<a href="#" class="vg-floating-nav__item" data-action="artists">Our&nbsp;Artists</a>
			<a href="#" class="vg-floating-nav__item" data-action="commissions">Private&nbsp;Commissions</a>
			<a href="#" class="vg-floating-nav__item vg-floating-nav__item--cta" data-action="tour">Virtual&nbsp;Tours</a>
		</nav>
	</section>

	<!-- LEFT: Artist Spotlight card -->
	<aside class="floating-panel floating-panel-left" data-depth="2.2" aria-label="Artist spotlight">
		<p class="vg-panel__eyebrow">Artist Spotlight</p>
		<div class="vg-artist">
			<div class="vg-artist__photo">
				<img class="vg-artist__img" src="" alt="" decoding="async">
			</div>
			<div class="vg-artist__body">
				<h3 class="vg-artist__name">—</h3>
				<p class="vg-artist__bio">Selecting a piece from the collection reveals its artist here. Live artist bios sync from the Media Library caption &amp; artist fields.</p>
				<a href="#" class="vg-artist__link">View collection →</a>
			</div>
		</div>
	</aside>

	<!-- RIGHT: Virtual Collection Manager + Active Display Grid -->
	<aside class="floating-panel floating-panel-right" data-depth="2.6" aria-label="Virtual collection manager">
		<div class="vg-panel__head">
			<p class="vg-panel__eyebrow">Active Display</p>
			<span class="vg-count"><span class="vg-count__num">0</span> pieces</span>
		</div>

		<!-- Image-source toggles -->
		<div class="vg-sources" role="group" aria-label="Image sources">
			<label class="vg-toggle">
				<input type="checkbox" checked data-source="wp">
				<span class="vg-toggle__track"><span class="vg-toggle__dot"></span></span>
				<span class="vg-toggle__label">WP&nbsp;Media&nbsp;Library</span>
			</label>
			<label class="vg-toggle">
				<input type="checkbox" data-source="external">
				<span class="vg-toggle__track"><span class="vg-toggle__dot"></span></span>
				<span class="vg-toggle__label">External</span>
			</label>
			<label class="vg-toggle">
				<input type="checkbox" data-source="custom">
				<span class="vg-toggle__track"><span class="vg-toggle__dot"></span></span>
				<span class="vg-toggle__label">Custom</span>
			</label>
		</div>

		<!-- Thumbnail grid populated from the serialized PHP array -->
		<div class="vg-grid" role="listbox" aria-label="Collection thumbnails"></div>
	</aside>

	<!-- RIGHT EDGE: Depth control + abstract gallery map -->
	<aside class="depth-control-sidebar" data-depth="1.6" aria-label="Depth and map controller">
		<div class="vg-depth">
			<span class="vg-depth__label">Depth</span>
			<input class="vg-depth__slider" type="range" min="0" max="100" value="55"
				orient="vertical" aria-label="Parallax depth intensity">
			<span class="vg-depth__value">55</span>
		</div>
		<div class="vg-map" aria-hidden="true">
			<span class="vg-map__label">Layout</span>
			<svg viewBox="0 0 60 90" class="vg-map__svg">
				<rect x="4"  y="6"  width="52" height="78" class="vg-map__room"/>
				<line x1="30" y1="6" x2="30" y2="84" class="vg-map__hall"/>
				<rect x="8"  y="12" width="16" height="10" class="vg-map__cell"/>
				<rect x="8"  y="30" width="16" height="10" class="vg-map__cell"/>
				<rect x="8"  y="48" width="16" height="10" class="vg-map__cell"/>
				<rect x="36" y="12" width="16" height="10" class="vg-map__cell"/>
				<rect x="36" y="30" width="16" height="14" class="vg-map__cell vg-map__cell--active"/>
				<rect x="36" y="52" width="16" height="10" class="vg-map__cell"/>
				<circle cx="30" cy="70" r="3" class="vg-map__you"/>
			</svg>
		</div>
	</aside>

	<!-- BOTTOM: Scrolling newsfeed marquee -->
	<div class="bottom-marquee" aria-label="Recent additions">
		<div class="vg-marquee__tag">Live</div>
		<div class="vg-marquee__viewport">
			<div class="vg-marquee__track">
				<span class="vg-marquee__item">Recent additions: <b>Sculptures by Alaisky</b></span>
				<span class="vg-marquee__sep">◆</span>
				<span class="vg-marquee__item">Now showing: <b class="vg-marquee__active">—</b></span>
				<span class="vg-marquee__sep">◆</span>
				<span class="vg-marquee__item">Source: <b class="vg-marquee__src">WP Media Library</b></span>
				<span class="vg-marquee__sep">◆</span>
				<span class="vg-marquee__item">Private commissions now open for 2026</span>
				<span class="vg-marquee__sep">◆</span>
			</div>
		</div>
	</div>

	<!-- FULLSCREEN STAGE — serves both the manual lightbox and the auto Virtual Tour -->
	<div class="vg-stage" id="vg-stage" role="dialog" aria-modal="true" aria-label="Artwork viewer" hidden>
		<div class="vg-stage__scrim" data-action="close"></div>

		<div class="vg-stage__inner">
			<figure class="vg-stage__figure">
				<img class="vg-stage__img" src="" alt="" decoding="async">
			</figure>
			<div class="vg-stage__caption">
				<p class="vg-stage__eyebrow"><span class="vg-stage__index">1 / 1</span></p>
				<h2 class="vg-stage__title">—</h2>
				<p class="vg-stage__meta">—</p>
				<p class="vg-stage__artist">—</p>
			</div>
		</div>

		<!-- Controls -->
		<button class="vg-stage__btn vg-stage__close" type="button" aria-label="Close viewer" data-action="close">✕</button>
		<button class="vg-stage__btn vg-stage__nav vg-stage__prev" type="button" aria-label="Previous artwork" data-action="prev">‹</button>
		<button class="vg-stage__btn vg-stage__nav vg-stage__next" type="button" aria-label="Next artwork" data-action="next">›</button>

		<!-- Virtual-tour transport bar (only visible while touring) -->
		<div class="vg-tour-bar" role="group" aria-label="Virtual tour controls">
			<button class="vg-tour-toggle" type="button" aria-label="Pause tour" data-action="tour-toggle">
				<span class="vg-tour-toggle__icon" aria-hidden="true">❚❚</span>
				<span class="vg-tour-toggle__text">Pause</span>
			</button>
			<div class="vg-tour-progress" aria-hidden="true"><span class="vg-tour-progress__fill"></span></div>
			<span class="vg-tour-status">Virtual tour</span>
			<button class="vg-tour-end" type="button" data-action="close">End tour</button>
		</div>
	</div>

</main>

<!-- =====================================================================
     3. CSS — GLASSMORPHISM, HARDWARE-ACCELERATED, RESPONSIVE
     ================================================================== -->
<style>
/* ---- Scoped reset & design tokens ---- */
#artpro-vg, #artpro-vg * { box-sizing: border-box; }
#artpro-vg {
	--paper:   #ece7df;               /* warm neutral gallery tone           */
	--paper-2: #dcd5c9;
	--ink:     #211d18;
	--muted:   #6c6459;
	--gold:    #b8912f;               /* ArtPro accent, tuned for glass      */
	--glass:   rgba(255,255,255,.42);
	--glass-2: rgba(255,255,255,.24);
	--glass-brd: rgba(255,255,255,.55);
	--shadow:  0 20px 60px rgba(40,34,25,.22);
	--font-display: 'Barlow Condensed','Oswald',-apple-system,system-ui,sans-serif;
	--font-body:    'Montserrat',-apple-system,'Segoe UI',system-ui,sans-serif;

	position: relative;
	min-height: 100vh;
	overflow: hidden;
	font-family: var(--font-body);
	color: var(--ink);
	background: var(--paper);
	perspective: 1400px;              /* enables the 3D depth effect         */
	isolation: isolate;
}

/* ---- Ambient environment (background layer) ---- */
.vg-environment { position:absolute; inset:0; z-index:0; overflow:hidden; }
.vg-wall {
	position:absolute; inset:0;
	background:
		radial-gradient(120% 90% at 50% 0%, #f3efe8 0%, #e6e0d6 55%, #d7cfc2 100%);
}
.vg-floor {
	position:absolute; left:-10%; right:-10%; bottom:-2%; height:42%;
	background: linear-gradient(180deg, #cdc4b5 0%, #bcb2a1 100%);
	transform: perspective(700px) rotateX(58deg);
	transform-origin: bottom center;
	opacity:.6;
}
.vg-spotlight {
	position:absolute; left:50%; top:-8%; width:70vw; height:70vw;
	max-width:900px; max-height:900px;
	transform: translateX(-50%);
	background: radial-gradient(circle at center, rgba(255,255,255,.7) 0%, rgba(255,255,255,0) 62%);
	pointer-events:none;
}
.vg-orb {
	position:absolute; border-radius:50%; filter: blur(40px); opacity:.5;
	will-change: transform;
}
.vg-orb--a { width:340px; height:340px; left:8%;  top:22%;
	background: radial-gradient(circle, rgba(184,145,47,.5), transparent 70%);
	animation: vg-drift 18s ease-in-out infinite; }
.vg-orb--b { width:300px; height:300px; right:10%; bottom:16%;
	background: radial-gradient(circle, rgba(120,150,180,.45), transparent 70%);
	animation: vg-drift 22s ease-in-out infinite reverse; }
@keyframes vg-drift {
	0%,100% { transform: translate3d(0,0,0); }
	50%     { transform: translate3d(30px,-24px,0); }
}

/* ---- Shared floating-layer base ---- */
.central-focal-point,
.floating-panel,
.depth-control-sidebar {
	position: absolute;
	z-index: 2;
	will-change: transform;                 /* promote to its own GPU layer   */
	transform: translate3d(0,0,0);
	transition: transform .12s cubic-bezier(.22,.61,.36,1);
	transform-style: preserve-3d;
}

/* ---- Glass panel look ---- */
.floating-panel,
.depth-control-sidebar,
.vg-floating-nav,
.bottom-marquee {
	background: var(--glass);
	-webkit-backdrop-filter: blur(12px) saturate(180%);
	backdrop-filter: blur(12px) saturate(180%);
	border: 1px solid var(--glass-brd);
	box-shadow: var(--shadow);
}

/* ---- Central focal point ---- */
.central-focal-point {
	left:50%; top:50%;
	width: min(46vw, 460px);
	transform: translate3d(-50%,-50%,0);
	display:flex; flex-direction:column; align-items:center; gap:22px;
}
.vg-frame {
	position:relative;
	width:100%; aspect-ratio: 4/5;
	background:#fff;
	padding:14px;
	border:1px solid var(--glass-brd);
	box-shadow: 0 30px 80px rgba(40,34,25,.34), 0 2px 0 rgba(255,255,255,.6) inset;
	transform-style: preserve-3d;
}
.vg-active-img {
	width:100%; height:100%; object-fit:cover; display:block;
	background:var(--paper-2);
	transition: opacity .5s ease;
}
.vg-active-img.is-swapping { opacity:0; }
.vg-frame__plate {
	position:absolute; left:14px; right:14px; bottom:14px;
	padding:12px 14px;
	background: rgba(20,17,13,.62);
	-webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
	color:#f4efe6;
	display:flex; flex-direction:column; gap:2px;
	transform: translateZ(30px);            /* pops forward in 3D space        */
}
.vg-frame__title {
	font-family:var(--font-display); font-weight:600; font-size:20px;
	letter-spacing:.06em; text-transform:uppercase; line-height:1.1;
}
.vg-frame__meta { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#d8cfbf; }

/* ---- Floating nav overlay ---- */
.vg-floating-nav {
	display:flex; gap:6px; padding:8px; border-radius:2px;
	flex-wrap:wrap; justify-content:center;
}
.vg-floating-nav__item {
	font-family:var(--font-display); font-weight:600;
	font-size:14px; letter-spacing:.18em; text-transform:uppercase;
	color:var(--ink); text-decoration:none;
	padding:8px 14px; border-radius:2px;
	transition: background .2s, color .2s;
}
.vg-floating-nav__item:hover { background:var(--ink); color:var(--paper); }

/* ---- Shared panel typography ---- */
.vg-panel__eyebrow {
	font-family:var(--font-display); font-weight:600;
	font-size:12px; letter-spacing:.24em; text-transform:uppercase;
	color:var(--gold); margin:0 0 14px;
}
.vg-panel__head { display:flex; align-items:baseline; justify-content:space-between; }
.vg-count { font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); }
.vg-count__num { color:var(--ink); font-weight:700; }

/* ---- LEFT: artist spotlight ---- */
.floating-panel-left {
	left: 3.5vw; top:50%;
	width: min(24vw, 300px);
	transform: translate3d(0,-50%,0);
	padding:22px;
	border-radius:4px;
}
.vg-artist__photo {
	width:100%; aspect-ratio:1/1; overflow:hidden; border-radius:3px;
	background:var(--paper-2); margin-bottom:16px;
	border:1px solid var(--glass-brd);
}
.vg-artist__img { width:100%; height:100%; object-fit:cover; display:block; filter:grayscale(.2); }
.vg-artist__name {
	font-family:var(--font-display); font-weight:600; font-size:26px;
	letter-spacing:.04em; text-transform:uppercase; margin:0 0 8px; line-height:1;
}
.vg-artist__bio { font-size:13px; line-height:1.6; color:var(--muted); margin:0 0 14px; }
.vg-artist__link {
	font-size:12px; letter-spacing:.1em; text-transform:uppercase;
	color:var(--ink); text-decoration:none; font-weight:600;
	border-bottom:1px solid var(--gold); padding-bottom:2px;
}

/* ---- RIGHT: collection manager ---- */
.floating-panel-right {
	right: 3.5vw; top:50%;
	width: min(26vw, 330px);
	transform: translate3d(0,-50%,0);
	padding:22px;
	border-radius:4px;
}
.vg-sources { display:flex; flex-direction:column; gap:10px; margin:16px 0 18px; }
.vg-toggle { display:flex; align-items:center; gap:10px; cursor:pointer; user-select:none; }
.vg-toggle input { position:absolute; opacity:0; pointer-events:none; }
.vg-toggle__track {
	width:34px; height:18px; border-radius:20px; flex:0 0 auto;
	background: rgba(33,29,24,.22); position:relative; transition:background .2s;
	border:1px solid var(--glass-brd);
}
.vg-toggle__dot {
	position:absolute; top:1px; left:1px; width:14px; height:14px; border-radius:50%;
	background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.3); transition:transform .2s;
}
.vg-toggle input:checked + .vg-toggle__track { background:var(--gold); }
.vg-toggle input:checked + .vg-toggle__track .vg-toggle__dot { transform:translateX(16px); }
.vg-toggle input:focus-visible + .vg-toggle__track { outline:2px solid var(--ink); outline-offset:2px; }
.vg-toggle__label { font-size:12px; letter-spacing:.06em; color:var(--ink); }

.vg-grid {
	display:grid; grid-template-columns:repeat(3,1fr); gap:8px;
	max-height:240px; overflow-y:auto; padding-right:4px;
}
.vg-grid::-webkit-scrollbar { width:6px; }
.vg-grid::-webkit-scrollbar-thumb { background:rgba(33,29,24,.25); border-radius:4px; }
.vg-thumb {
	position:relative; aspect-ratio:1/1; overflow:hidden; border-radius:3px;
	cursor:pointer; border:1px solid transparent; background:var(--paper-2);
	padding:0; transition:border-color .18s, transform .18s;
}
.vg-thumb img { width:100%; height:100%; object-fit:cover; display:block;
	filter:grayscale(.35); transition:filter .25s, transform .3s; }
.vg-thumb:hover img { filter:grayscale(0); transform:scale(1.08); }
.vg-thumb.is-active { border-color:var(--gold); }
.vg-thumb.is-active::after {
	content:""; position:absolute; inset:0; border:2px solid var(--gold);
	border-radius:3px; pointer-events:none;
}

/* ---- Depth control sidebar ---- */
.depth-control-sidebar {
	right: calc(3.5vw + min(26vw,330px) + 18px);
	top:50%; transform:translate3d(0,-50%,0);
	width:70px; padding:16px 10px; border-radius:4px;
	display:flex; flex-direction:column; align-items:center; gap:16px;
}
.vg-depth { display:flex; flex-direction:column; align-items:center; gap:10px; }
.vg-depth__label, .vg-map__label {
	font-family:var(--font-display); font-weight:600; font-size:11px;
	letter-spacing:.2em; text-transform:uppercase; color:var(--muted);
}
.vg-depth__slider {
	-webkit-appearance:none; appearance:none;
	writing-mode: vertical-lr; direction: rtl;      /* vertical slider, broad support */
	width:6px; height:140px; border-radius:4px;
	background: linear-gradient(var(--gold), rgba(33,29,24,.2));
	cursor:pointer;
}
.vg-depth__slider::-webkit-slider-thumb {
	-webkit-appearance:none; width:18px; height:18px; border-radius:50%;
	background:#fff; border:2px solid var(--gold); box-shadow:0 2px 6px rgba(0,0,0,.3);
}
.vg-depth__slider::-moz-range-thumb {
	width:18px; height:18px; border-radius:50%; background:#fff;
	border:2px solid var(--gold); box-shadow:0 2px 6px rgba(0,0,0,.3);
}
.vg-depth__value { font-size:12px; font-weight:700; color:var(--ink); font-variant-numeric:tabular-nums; }
.vg-map { display:flex; flex-direction:column; align-items:center; gap:8px; width:100%; }
.vg-map__svg { width:46px; height:auto; }
.vg-map__room { fill:none; stroke:rgba(33,29,24,.35); stroke-width:1.4; }
.vg-map__hall { stroke:rgba(33,29,24,.2); stroke-width:1; stroke-dasharray:2 3; }
.vg-map__cell { fill:rgba(33,29,24,.14); }
.vg-map__cell--active { fill:var(--gold); }
.vg-map__you { fill:var(--ink); }

/* ---- Bottom marquee ---- */
.bottom-marquee {
	position:absolute; left:0; right:0; bottom:0; z-index:3;
	height:46px; display:flex; align-items:center; gap:14px;
	padding:0 16px; border-left:0; border-right:0; border-bottom:0;
	border-radius:0;
}
.vg-marquee__tag {
	flex:0 0 auto; font-family:var(--font-display); font-weight:600;
	font-size:12px; letter-spacing:.2em; text-transform:uppercase;
	color:var(--paper); background:var(--gold);
	padding:5px 12px; border-radius:2px;
}
.vg-marquee__viewport { flex:1 1 auto; overflow:hidden; }
.vg-marquee__track {
	display:inline-flex; align-items:center; gap:22px; white-space:nowrap;
	will-change: transform; animation: vg-scroll 32s linear infinite;
}
.vg-marquee__item { font-size:13px; letter-spacing:.05em; color:var(--ink); }
.vg-marquee__item b { color:var(--ink); font-weight:700; }
.vg-marquee__sep { color:var(--gold); font-size:9px; }
@keyframes vg-scroll {
	from { transform: translateX(0); }
	to   { transform: translateX(-50%); }
}

/* ---- Responsive: stack the experience on tablet & phone ---- */
@media (max-width: 1024px) {
	#artpro-vg { overflow-y:auto; }
	.central-focal-point { position:relative; left:auto; top:auto; transform:none;
		width:min(80vw,420px); margin:32px auto 0; }
	.floating-panel-left, .floating-panel-right, .depth-control-sidebar {
		position:relative; left:auto; right:auto; top:auto; transform:none;
		width:min(92vw,460px); margin:18px auto;
	}
	.depth-control-sidebar { flex-direction:row; width:min(92vw,460px); justify-content:space-around; }
	.vg-depth__slider { writing-mode:horizontal-tb; width:160px; height:6px; }
	.bottom-marquee { position:relative; margin-top:20px; }
	.vg-floor { display:none; }
}

/* ---- Motion-reduction respect ---- */
@media (prefers-reduced-motion: reduce) {
	.vg-orb, .vg-marquee__track { animation:none; }
	.central-focal-point, .floating-panel, .depth-control-sidebar { transition:none; }
}
</style>

<!-- =====================================================================
     4. INTERACTIVE JAVASCRIPT
     ================================================================== -->
<script>
(function () {
	"use strict";

	/* ------------------------------------------------------------------
	 * 4a. Serialized PHP → JS. wp_json_encode safely escapes for a JS
	 *     context (proper Unicode + slash escaping), preventing XSS and
	 *     broken output. This is the live Media Library payload.
	 * --------------------------------------------------------------- */
	var GALLERY = <?php echo wp_json_encode( array_values( $artpro_gallery_images ) ); ?> || [];

	var root = document.getElementById('artpro-vg');
	if (!root || !GALLERY.length) { return; }

	/* ---- Cache DOM refs ---- */
	var focal       = root.querySelector('.central-focal-point');
	var activeImg   = root.querySelector('.vg-active-img');
	var frameTitle  = root.querySelector('.vg-frame__title');
	var frameMeta   = root.querySelector('.vg-frame__meta');
	var grid        = root.querySelector('.vg-grid');
	var countNum    = root.querySelector('.vg-count__num');
	var artistImg   = root.querySelector('.vg-artist__img');
	var artistName  = root.querySelector('.vg-artist__name');
	var artistBio   = root.querySelector('.vg-artist__bio');
	var slider      = root.querySelector('.vg-depth__slider');
	var sliderVal   = root.querySelector('.vg-depth__value');
	var marqueeNow  = root.querySelector('.vg-marquee__active');
	var marqueeSrc  = root.querySelector('.vg-marquee__src');
	var layers      = Array.prototype.slice.call(root.querySelectorAll('[data-depth]'));

	countNum.textContent = GALLERY.length;

	/* ------------------------------------------------------------------
	 * 4b. Build the thumbnail grid from the serialized array.
	 * --------------------------------------------------------------- */
	var thumbs = [];
	GALLERY.forEach(function (item, i) {
		var btn = document.createElement('button');
		btn.className = 'vg-thumb';
		btn.type = 'button';
		btn.setAttribute('role', 'option');
		btn.setAttribute('aria-label', item.title || ('Artwork ' + (i + 1)));
		var im = document.createElement('img');
		im.src = item.thumb || item.url;
		im.alt = item.title || '';
		im.loading = 'lazy';
		im.decoding = 'async';
		btn.appendChild(im);
		btn.addEventListener('click', function () { setActive(i); });
		grid.appendChild(btn);
		thumbs.push(btn);
	});

	/* ------------------------------------------------------------------
	 * 4c. Swap the active centre piece + sync spotlight + marquee.
	 * --------------------------------------------------------------- */
	var current = -1;
	function setActive(i) {
		if (i === current) { return; }
		var item = GALLERY[i];
		if (!item) { return; }

		// Cross-fade the centre image.
		activeImg.classList.add('is-swapping');
		var pre = new Image();
		pre.onload = function () {
			activeImg.src = item.url;
			activeImg.alt = item.title || 'Artwork';
			requestAnimationFrame(function () { activeImg.classList.remove('is-swapping'); });
		};
		pre.src = item.url;

		frameTitle.textContent = item.title || 'Untitled';
		frameMeta.textContent  = item.caption || 'ArtPro Gallery';

		// Artist spotlight sync.
		artistImg.src  = item.thumb || item.url;
		artistImg.alt  = item.artist || item.title || '';
		artistName.textContent = item.artist || 'ArtPro Collection';
		artistBio.textContent  = item.caption
			? item.caption + ' — part of the live gallery collection, synced from the Media Library.'
			: 'A featured piece from the ArtPro collection, synced live from the WordPress Media Library.';

		// Marquee "now showing".
		if (marqueeNow) { marqueeNow.textContent = item.title || 'Untitled'; }

		// Active state on thumbnails.
		thumbs.forEach(function (t, ti) { t.classList.toggle('is-active', ti === i); });
		current = i;
	}

	setActive(0); // Boot with the first (latest) piece.

	/* ------------------------------------------------------------------
	 * 4d. Image-source toggles → update the marquee source label. Only WP
	 *     Media Library is wired to real data; External/Custom are UI stubs
	 *     that report their state honestly rather than faking a feed.
	 * --------------------------------------------------------------- */
	var sourceToggles = Array.prototype.slice.call(root.querySelectorAll('.vg-toggle input'));
	function refreshSources() {
		var on = sourceToggles
			.filter(function (t) { return t.checked; })
			.map(function (t) {
				return { wp: 'WP Media Library', external: 'External', custom: 'Custom' }[t.dataset.source];
			});
		if (marqueeSrc) { marqueeSrc.textContent = on.length ? on.join(' + ') : 'None selected'; }
	}
	sourceToggles.forEach(function (t) { t.addEventListener('change', refreshSources); });
	refreshSources();

	/* ------------------------------------------------------------------
	 * 4e. Mouse-parallax depth. Each layer moves by an amount proportional
	 *     to its data-depth and the current Depth-slider intensity. We
	 *     lerp toward the target each frame for buttery motion, and only
	 *     touch transforms (GPU-friendly, no layout thrash).
	 * --------------------------------------------------------------- */
	var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	var intensity = parseInt(slider.value, 10) / 100;   // 0 → 1
	var targetX = 0, targetY = 0, curX = 0, curY = 0;
	var isDesktop = window.matchMedia('(min-width: 1025px)').matches;

	slider.addEventListener('input', function () {
		intensity = parseInt(slider.value, 10) / 100;
		sliderVal.textContent = slider.value;
	});

	if (!reduceMotion && isDesktop) {
		window.addEventListener('mousemove', function (e) {
			// Normalised -0.5 … 0.5 around viewport centre.
			targetX = (e.clientX / window.innerWidth)  - 0.5;
			targetY = (e.clientY / window.innerHeight) - 0.5;
		}, { passive: true });

		(function raf() {
			// Ease current toward target.
			curX += (targetX - curX) * 0.08;
			curY += (targetY - curY) * 0.08;

			layers.forEach(function (el) {
				var depth = parseFloat(el.getAttribute('data-depth')) || 1;
				// Base translate keeps each panel anchored where CSS placed it.
				var base = el.classList.contains('central-focal-point') ? 'translate(-50%,-50%)'
					: (el.classList.contains('floating-panel-left') || el.classList.contains('floating-panel-right') || el.classList.contains('depth-control-sidebar'))
						? 'translateY(-50%)' : '';
				var maxShift = 26 * depth * intensity;      // px
				var tx = -curX * maxShift;                  // opposite direction = depth
				var ty = -curY * maxShift;
				var rot = curX * 4 * intensity * (el.classList.contains('central-focal-point') ? 1 : 0);
				el.style.transform =
					base + ' translate3d(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px,0)' +
					(rot ? ' rotateY(' + rot.toFixed(2) + 'deg)' : '');
			});
			requestAnimationFrame(raf);
		})();
	}

	/* ------------------------------------------------------------------
	 * 4f. Keyboard nav for the grid (left/right arrows) — accessibility.
	 * --------------------------------------------------------------- */
	root.addEventListener('keydown', function (e) {
		if (e.key === 'ArrowRight') { setActive((current + 1) % GALLERY.length); }
		else if (e.key === 'ArrowLeft') { setActive((current - 1 + GALLERY.length) % GALLERY.length); }
	});

})();
</script>

<?php
get_footer();
