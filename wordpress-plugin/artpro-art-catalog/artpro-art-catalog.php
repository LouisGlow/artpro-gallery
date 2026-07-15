<?php
/**
 * Plugin Name:       ArtPro Art Catalog
 * Description:        Private, staff-only art catalog / BOM for ArtPro Gallery. Captures Photo, Piece name, Artist, Size of art, Size of frame and a manual Catalogue ID. Provides a branded, login-gated front-end capture form, a staff catalog list and CSV (BOM) export. Records are stored in the WordPress database and never shown on the public site.
 * Version:           1.0.0
 * Author:            ArtPro Gallery
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * License:           GPL-2.0-or-later
 *
 * USAGE (see README.md):
 *   1. Install & activate this plugin.
 *   2. Give Jaline a user account with the role "Gallery Staff" (or Administrator/Editor).
 *   3. Create a Page called "Add a Piece" containing the shortcode:   [artpro_capture]
 *   4. Create a Page called "Catalog" (or "BOM") containing:          [artpro_catalog]
 *   Both pages gate themselves to logged-in staff automatically.
 *
 * @package ArtPro_Art_Catalog
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // No direct access.
}

/* -------------------------------------------------------------------------
 * Constants
 * ---------------------------------------------------------------------- */
define( 'APC_VERSION', '1.0.0' );
define( 'APC_CPT', 'art_piece' );          // internal post type key
define( 'APC_CAP', 'edit_art_pieces' );    // "can use the catalog" primitive cap
define( 'APC_META', array(                 // meta_key => label
	'_apc_artist'      => 'Artist name',
	'_apc_art_size'    => 'Size of art',
	'_apc_frame_size'  => 'Size of frame',
	'_apc_cat_id'      => 'Catalogue ID',
) );

/* -------------------------------------------------------------------------
 * 1. CUSTOM POST TYPE  — a private "Art Piece" record (admin only, never public)
 * ---------------------------------------------------------------------- */
function apc_register_cpt() {
	$labels = array(
		'name'               => 'Art Pieces',
		'singular_name'      => 'Art Piece',
		'menu_name'          => 'Art Catalog',
		'add_new'            => 'Add Piece',
		'add_new_item'       => 'Add a Piece',
		'edit_item'          => 'Edit Piece',
		'new_item'           => 'New Piece',
		'view_item'          => 'View Piece',
		'search_items'       => 'Search Pieces',
		'not_found'          => 'No pieces captured yet',
		'not_found_in_trash' => 'No pieces in trash',
		'all_items'          => 'All Pieces',
	);

	register_post_type( APC_CPT, array(
		'labels'              => $labels,
		'public'              => false,   // not queryable on the front end
		'publicly_queryable'  => false,   // no single URLs on the public site
		'exclude_from_search' => true,    // never in site search
		'show_ui'             => true,    // editable in wp-admin
		'show_in_menu'        => true,
		'show_in_rest'        => false,   // classic edit screen (simpler meta box)
		'menu_icon'           => 'dashicons-format-image',
		'menu_position'       => 26,
		'hierarchical'        => false,
		'supports'            => array( 'title', 'thumbnail' ), // title = piece name, thumbnail = photo
		'capability_type'     => array( 'art_piece', 'art_pieces' ),
		'map_meta_cap'        => true,
	) );
}
add_action( 'init', 'apc_register_cpt' );

/* Register the meta so it is sanitised and protected. */
function apc_register_meta() {
	foreach ( array_keys( APC_META ) as $key ) {
		register_post_meta( APC_CPT, $key, array(
			'type'              => 'string',
			'single'            => true,
			'sanitize_callback' => 'sanitize_text_field',
			'show_in_rest'      => false,
			'auth_callback'     => function () { return current_user_can( APC_CAP ); },
		) );
	}
}
add_action( 'init', 'apc_register_meta' );

/* -------------------------------------------------------------------------
 * 2. ROLES & CAPABILITIES  — only staff may use the catalog
 * ---------------------------------------------------------------------- */
function apc_all_caps() {
	return array(
		'edit_art_piece', 'read_art_piece', 'delete_art_piece',
		'edit_art_pieces', 'edit_others_art_pieces', 'publish_art_pieces',
		'read_private_art_pieces', 'delete_art_pieces', 'delete_private_art_pieces',
		'delete_published_art_pieces', 'delete_others_art_pieces',
		'edit_private_art_pieces', 'edit_published_art_pieces',
	);
}

function apc_activate() {
	// A dedicated "Gallery Staff" role: can capture & manage pieces + upload photos, nothing else.
	$caps = array( 'read' => true, 'upload_files' => true );
	foreach ( apc_all_caps() as $c ) {
		$caps[ $c ] = true;
	}
	remove_role( 'gallery_staff' );
	add_role( 'gallery_staff', 'Gallery Staff', $caps );

	// Administrators (and editors) also get full access.
	foreach ( array( 'administrator', 'editor' ) as $role_name ) {
		$role = get_role( $role_name );
		if ( $role ) {
			foreach ( apc_all_caps() as $c ) {
				$role->add_cap( $c );
			}
		}
	}

	apc_register_cpt();
	flush_rewrite_rules();
}
register_activation_hook( __FILE__, 'apc_activate' );

function apc_deactivate() {
	flush_rewrite_rules();
}
register_deactivation_hook( __FILE__, 'apc_deactivate' );

/* -------------------------------------------------------------------------
 * 3. ADMIN META BOX  — capture fields on the wp-admin edit screen
 *    (front-end form below is the primary capture UI, but this keeps the
 *     back office fully functional too.)
 * ---------------------------------------------------------------------- */
function apc_add_meta_box() {
	add_meta_box( 'apc_details', 'Piece details', 'apc_render_meta_box', APC_CPT, 'normal', 'high' );
}
add_action( 'add_meta_boxes', 'apc_add_meta_box' );

function apc_render_meta_box( $post ) {
	wp_nonce_field( 'apc_save_meta', 'apc_meta_nonce' );
	echo '<style>.apc-admin-field{margin:0 0 14px}.apc-admin-field label{display:block;font-weight:600;margin:0 0 4px}.apc-admin-field input{width:100%;max-width:420px}</style>';
	foreach ( APC_META as $key => $label ) {
		$val = get_post_meta( $post->ID, $key, true );
		printf(
			'<div class="apc-admin-field"><label for="%1$s">%2$s</label><input type="text" id="%1$s" name="%1$s" value="%3$s"></div>',
			esc_attr( $key ),
			esc_html( $label ),
			esc_attr( $val )
		);
	}
	echo '<p class="description">Photo is the <strong>Featured image</strong> (set it in the sidebar). Piece name is the <strong>Title</strong> above.</p>';
}

function apc_save_meta( $post_id ) {
	if ( ! isset( $_POST['apc_meta_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['apc_meta_nonce'] ) ), 'apc_save_meta' ) ) {
		return;
	}
	if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
		return;
	}
	if ( ! current_user_can( 'edit_art_piece', $post_id ) ) {
		return;
	}
	foreach ( array_keys( APC_META ) as $key ) {
		if ( isset( $_POST[ $key ] ) ) {
			update_post_meta( $post_id, $key, sanitize_text_field( wp_unslash( $_POST[ $key ] ) ) );
		}
	}
}
add_action( 'save_post_' . APC_CPT, 'apc_save_meta' );

/* Admin list columns: thumbnail + all fields. */
function apc_admin_columns( $cols ) {
	$new = array(
		'cb'          => isset( $cols['cb'] ) ? $cols['cb'] : '',
		'apc_thumb'   => 'Photo',
		'title'       => 'Piece name',
		'apc_artist'  => 'Artist',
		'apc_art'     => 'Art size',
		'apc_frame'   => 'Frame size',
		'apc_cat'     => 'Catalogue ID',
		'date'        => 'Captured',
	);
	return $new;
}
add_filter( 'manage_' . APC_CPT . '_posts_columns', 'apc_admin_columns' );

function apc_admin_column_content( $col, $post_id ) {
	switch ( $col ) {
		case 'apc_thumb':
			echo has_post_thumbnail( $post_id ) ? get_the_post_thumbnail( $post_id, array( 60, 60 ) ) : '—';
			break;
		case 'apc_artist':
			echo esc_html( get_post_meta( $post_id, '_apc_artist', true ) ?: '—' );
			break;
		case 'apc_art':
			echo esc_html( get_post_meta( $post_id, '_apc_art_size', true ) ?: '—' );
			break;
		case 'apc_frame':
			echo esc_html( get_post_meta( $post_id, '_apc_frame_size', true ) ?: '—' );
			break;
		case 'apc_cat':
			echo esc_html( get_post_meta( $post_id, '_apc_cat_id', true ) ?: '—' );
			break;
	}
}
add_action( 'manage_' . APC_CPT . '_posts_custom_column', 'apc_admin_column_content', 10, 2 );

/* -------------------------------------------------------------------------
 * 4. FRONT-END FORM HANDLER  (PRG pattern — process before output, then redirect)
 * ---------------------------------------------------------------------- */
function apc_handle_submit() {
	if ( empty( $_POST['apc_capture_submit'] ) ) {
		return;
	}

	$redirect = isset( $_POST['apc_redirect'] ) ? esc_url_raw( wp_unslash( $_POST['apc_redirect'] ) ) : home_url( '/' );

	// Auth + nonce.
	if ( ! is_user_logged_in() || ! current_user_can( APC_CAP ) ) {
		apc_set_notice( 'error', 'You do not have permission to add pieces.' );
		wp_safe_redirect( $redirect ); exit;
	}
	if ( ! isset( $_POST['apc_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['apc_nonce'] ) ), 'apc_capture' ) ) {
		apc_set_notice( 'error', 'Security check failed — please try again.' );
		wp_safe_redirect( $redirect ); exit;
	}

	// Required: piece name.
	$title = isset( $_POST['apc_title'] ) ? sanitize_text_field( wp_unslash( $_POST['apc_title'] ) ) : '';
	if ( '' === $title ) {
		apc_set_notice( 'error', 'Please enter the piece name.' );
		wp_safe_redirect( $redirect ); exit;
	}

	// Create the record.
	$post_id = wp_insert_post( array(
		'post_type'   => APC_CPT,
		'post_status' => 'publish',
		'post_title'  => $title,
		'post_author' => get_current_user_id(),
	), true );

	if ( is_wp_error( $post_id ) || ! $post_id ) {
		apc_set_notice( 'error', 'Could not save the piece. Please try again.' );
		wp_safe_redirect( $redirect ); exit;
	}

	// Meta fields.
	$map = array(
		'_apc_artist'     => 'apc_artist',
		'_apc_art_size'   => 'apc_art_size',
		'_apc_frame_size' => 'apc_frame_size',
		'_apc_cat_id'     => 'apc_cat_id',
	);
	foreach ( $map as $meta_key => $field ) {
		$value = isset( $_POST[ $field ] ) ? sanitize_text_field( wp_unslash( $_POST[ $field ] ) ) : '';
		update_post_meta( $post_id, $meta_key, $value );
	}

	// Remember the artist so it stays pre-filled for the next piece (bulk capture).
	set_transient(
		'apc_last_artist_' . get_current_user_id(),
		isset( $_POST['apc_artist'] ) ? sanitize_text_field( wp_unslash( $_POST['apc_artist'] ) ) : '',
		6 * HOUR_IN_SECONDS
	);

	// Photo upload -> featured image.
	if ( ! empty( $_FILES['apc_photo']['name'] ) ) {
		require_once ABSPATH . 'wp-admin/includes/image.php';
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/media.php';

		$type = isset( $_FILES['apc_photo']['type'] ) ? sanitize_text_field( wp_unslash( $_FILES['apc_photo']['type'] ) ) : '';
		if ( 0 !== strpos( $type, 'image/' ) ) {
			apc_set_notice( 'warning', 'Piece saved, but the photo was not an image and was skipped.' );
		} else {
			$attach_id = media_handle_upload( 'apc_photo', $post_id );
			if ( is_wp_error( $attach_id ) ) {
				apc_set_notice( 'warning', 'Piece saved, but the photo upload failed: ' . $attach_id->get_error_message() );
			} else {
				set_post_thumbnail( $post_id, $attach_id );
			}
		}
	}

	if ( ! apc_get_notice() ) {
		apc_set_notice( 'success', 'Saved “' . $title . '” to the catalog.' );
	}
	wp_safe_redirect( add_query_arg( 'apc_saved', '1', $redirect ) );
	exit;
}
add_action( 'template_redirect', 'apc_handle_submit' );

/* Small per-user notice store (survives the redirect). */
function apc_set_notice( $type, $msg ) {
	set_transient( 'apc_notice_' . get_current_user_id(), array( 'type' => $type, 'msg' => $msg ), 60 );
}
function apc_get_notice() {
	$n = get_transient( 'apc_notice_' . get_current_user_id() );
	if ( $n ) {
		delete_transient( 'apc_notice_' . get_current_user_id() );
	}
	return $n;
}

/* -------------------------------------------------------------------------
 * 5. CSV EXPORT  (the end-of-day BOM)
 * ---------------------------------------------------------------------- */
function apc_maybe_export_csv() {
	if ( empty( $_GET['apc_export'] ) || 'csv' !== $_GET['apc_export'] ) {
		return;
	}
	if ( ! is_user_logged_in() || ! current_user_can( APC_CAP ) ) {
		wp_die( 'You do not have permission to export the catalog.' );
	}
	if ( ! isset( $_GET['_apcnonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_GET['_apcnonce'] ) ), 'apc_export' ) ) {
		wp_die( 'Security check failed.' );
	}

	$pieces = get_posts( array(
		'post_type'      => APC_CPT,
		'post_status'    => 'publish',
		'posts_per_page' => -1,
		'orderby'        => 'date',
		'order'          => 'DESC',
	) );

	nocache_headers();
	header( 'Content-Type: text/csv; charset=utf-8' );
	header( 'Content-Disposition: attachment; filename="artpro-catalog-bom-' . gmdate( 'Y-m-d' ) . '.csv"' );

	$out = fopen( 'php://output', 'w' );
	fputcsv( $out, array( 'Catalogue ID', 'Piece name', 'Artist', 'Size of art', 'Size of frame', 'Photo URL', 'Captured' ) );
	foreach ( $pieces as $p ) {
		$thumb_id = get_post_thumbnail_id( $p->ID );
		$photo    = $thumb_id ? wp_get_attachment_url( $thumb_id ) : '';
		fputcsv( $out, array(
			get_post_meta( $p->ID, '_apc_cat_id', true ),
			get_the_title( $p ),
			get_post_meta( $p->ID, '_apc_artist', true ),
			get_post_meta( $p->ID, '_apc_art_size', true ),
			get_post_meta( $p->ID, '_apc_frame_size', true ),
			$photo,
			get_the_date( 'Y-m-d H:i', $p ),
		) );
	}
	fclose( $out );
	exit;
}
add_action( 'template_redirect', 'apc_maybe_export_csv' );

/* -------------------------------------------------------------------------
 * 6. FRONT-END STYLES  (scoped, ArtPro palette)
 * ---------------------------------------------------------------------- */
function apc_styles() {
	static $done = false;
	if ( $done ) { return; }
	$done = true;
	?>
<style id="apc-styles">
.apc{--gold:#b8912f;--gold-deep:#8a6d1f;--ink:#211d18;--muted:#6c6459;--paper:#f3efe8;--surface:#fff;--border:#e0d9cd;
  font-family:'Montserrat',-apple-system,'Segoe UI',system-ui,sans-serif;color:var(--ink);max-width:1080px;margin-inline:auto;}
.apc *{box-sizing:border-box;}
.apc__kicker{font-family:'Barlow Condensed','Oswald',sans-serif;text-transform:uppercase;letter-spacing:.28em;font-size:12px;color:var(--gold-deep);margin:0 0 10px;}
.apc__title{font-family:'Barlow Condensed','Oswald',sans-serif;text-transform:uppercase;letter-spacing:.02em;line-height:1;font-size:clamp(28px,4vw,46px);margin:0 0 8px;color:var(--ink);}
.apc__hint{color:var(--muted);font-size:14px;margin:0 0 20px;max-width:52ch;}
.apc-notice{padding:14px 16px;border-radius:3px;margin:0 0 20px;font-size:15px;border:1px solid;}
.apc-notice--success{background:#eef6ee;border-color:#bcdcbc;color:#22581f;}
.apc-notice--error{background:#fbeeee;border-color:#e3bcbc;color:#7a2020;}
.apc-notice--warning{background:#fbf6e8;border-color:#e6d8a8;color:#6b5410;}
.apc-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 22px;background:var(--surface);border:1px solid var(--border);padding:clamp(16px,3vw,32px);}
.apc-field{display:flex;flex-direction:column;gap:7px;}
.apc-field--full{grid-column:1/-1;}
.apc-field label{font-family:'Barlow Condensed','Oswald',sans-serif;text-transform:uppercase;letter-spacing:.12em;font-size:13px;color:var(--ink);}
.apc-field .req{color:var(--gold-deep);}
.apc-field input[type=text]{width:100%;min-height:52px;padding:13px 16px;border:1px solid var(--border);background:#fbfaf7;font:inherit;font-size:16px;color:var(--ink);border-radius:3px;}
.apc-field input[type=text]:focus{outline:none;border-color:var(--gold);box-shadow:0 0 0 3px rgba(184,145,47,.16);}
/* big take-photo / upload button */
.apc-file{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:120px;border:2px dashed var(--border);background:#fbfaf7;border-radius:5px;cursor:pointer;font-family:'Barlow Condensed','Oswald',sans-serif;text-transform:uppercase;letter-spacing:.1em;font-size:15px;color:var(--muted);padding:18px;text-align:center;transition:border-color .2s,background .2s,color .2s;-webkit-tap-highlight-color:transparent;}
.apc-file:hover,.apc-file:active{border-color:var(--gold);background:#fff;color:var(--ink);}
.apc-file__icon{font-size:30px;line-height:1;}
.apc-preview{margin-top:12px;width:100%;max-width:300px;border:1px solid var(--border);border-radius:4px;display:none;}
.apc-actions{grid-column:1/-1;display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:6px;}
.apc-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:54px;font-family:'Barlow Condensed','Oswald',sans-serif;font-weight:600;letter-spacing:.12em;text-transform:uppercase;font-size:15px;text-decoration:none;cursor:pointer;padding:14px 28px;border:1px solid var(--gold);background:var(--gold);color:#1a1712;border-radius:3px;transition:background .2s,color .2s;-webkit-tap-highlight-color:transparent;}
.apc-btn:hover{background:#cda43a;border-color:#cda43a;}
.apc-btn--ghost{background:transparent;color:var(--ink);border-color:var(--border);}
.apc-btn--ghost:hover{background:var(--ink);color:var(--paper);border-color:var(--ink);}
.apc-gate{background:var(--surface);border:1px solid var(--border);padding:clamp(20px,4vw,40px);text-align:center;}
.apc-toolbar{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:0 0 20px;}
.apc-search{display:flex;gap:8px;}
.apc-search input{min-height:48px;padding:10px 14px;border:1px solid var(--border);background:#fbfaf7;font:inherit;font-size:16px;min-width:200px;border-radius:3px;}
.apc-count{font-family:'Barlow Condensed','Oswald',sans-serif;text-transform:uppercase;letter-spacing:.14em;font-size:12px;color:var(--muted);}
.apc-table-wrap{overflow-x:auto;border:1px solid var(--border);}
.apc-table{width:100%;border-collapse:collapse;background:var(--surface);font-size:14px;min-width:720px;}
.apc-table th{background:var(--paper);text-align:left;font-family:'Barlow Condensed','Oswald',sans-serif;text-transform:uppercase;letter-spacing:.1em;font-size:12px;color:var(--ink);padding:12px 14px;border-bottom:1px solid var(--border);}
.apc-table td{padding:10px 14px;border-bottom:1px solid var(--border);vertical-align:middle;}
.apc-table tr:last-child td{border-bottom:0;}
.apc-table img{width:54px;height:54px;object-fit:cover;border:1px solid var(--border);display:block;}
.apc-empty{padding:40px 16px;text-align:center;color:var(--muted);}
@media(max-width:680px){
  .apc-form{grid-template-columns:1fr;gap:16px;padding:16px;}
  .apc-actions{flex-direction:column;align-items:stretch;}
  .apc-btn{width:100%;}
  .apc-file{min-height:150px;font-size:16px;}
  .apc__title{font-size:32px;}
  .apc-toolbar{flex-direction:column;align-items:stretch;}
  .apc-search{width:100%;}
  .apc-search input{flex:1;min-width:0;}
}
</style>
	<?php
}

/* -------------------------------------------------------------------------
 * 7. SHORTCODE  [artpro_capture]  — branded, login-gated capture form
 * ---------------------------------------------------------------------- */
function apc_shortcode_capture() {
	apc_styles();
	$current = apc_current_url();

	if ( ! is_user_logged_in() ) {
		return apc_gate( 'Staff sign-in required', 'Please sign in with your gallery staff account to add pieces.', wp_login_url( $current ), 'Sign in' );
	}
	if ( ! current_user_can( APC_CAP ) ) {
		return apc_gate( 'No access', 'Your account is not set up as gallery staff. Ask an administrator to grant access.', '', '' );
	}

	ob_start();
	$notice = apc_get_notice();
	$last_artist = get_transient( 'apc_last_artist_' . get_current_user_id() );
	if ( ! is_string( $last_artist ) ) { $last_artist = ''; }
	?>
<div class="apc">
	<p class="apc__kicker">Staff · Art catalog</p>
	<h2 class="apc__title">Add a piece</h2>
	<p class="apc__hint">Snap or upload a photo, fill in the details, and tap <b>Save &amp; add next</b>. The form clears each time so you can capture piece after piece — the artist name stays filled in.</p>

	<?php if ( $notice ) : ?>
		<div class="apc-notice apc-notice--<?php echo esc_attr( $notice['type'] ); ?>"><?php echo esc_html( $notice['msg'] ); ?></div>
	<?php endif; ?>

	<form class="apc-form" method="post" enctype="multipart/form-data" action="<?php echo esc_url( $current ); ?>">
		<?php wp_nonce_field( 'apc_capture', 'apc_nonce' ); ?>
		<input type="hidden" name="apc_redirect" value="<?php echo esc_url( $current ); ?>">

		<div class="apc-field apc-field--full">
			<label>Photo</label>
			<label class="apc-file" for="apc_photo">
				<span class="apc-file__icon" aria-hidden="true">&#128247;</span>
				<span class="apc-file__text" id="apc_file_text">Take a photo or upload</span>
			</label>
			<input type="file" id="apc_photo" name="apc_photo" accept="image/*" hidden>
			<img class="apc-preview" id="apc_preview" alt="Preview">
		</div>

		<div class="apc-field apc-field--full">
			<label for="apc_title">Piece name <span class="req">*</span></label>
			<input type="text" id="apc_title" name="apc_title" required autofocus autocapitalize="words" autocomplete="off" enterkeyhint="next">
		</div>

		<div class="apc-field">
			<label for="apc_artist">Artist name</label>
			<input type="text" id="apc_artist" name="apc_artist" value="<?php echo esc_attr( $last_artist ); ?>" autocapitalize="words" autocomplete="off" enterkeyhint="next">
		</div>
		<div class="apc-field">
			<label for="apc_cat_id">Catalogue ID</label>
			<input type="text" id="apc_cat_id" name="apc_cat_id" placeholder="e.g. AP-0142" autocapitalize="characters" autocomplete="off" enterkeyhint="next">
		</div>

		<div class="apc-field">
			<label for="apc_art_size">Size of art</label>
			<input type="text" id="apc_art_size" name="apc_art_size" placeholder="e.g. 600 &times; 900 mm" autocomplete="off" enterkeyhint="next">
		</div>
		<div class="apc-field">
			<label for="apc_frame_size">Size of frame</label>
			<input type="text" id="apc_frame_size" name="apc_frame_size" placeholder="e.g. 700 &times; 1000 mm" autocomplete="off" enterkeyhint="done">
		</div>

		<div class="apc-actions">
			<button type="submit" name="apc_capture_submit" value="1" class="apc-btn">Save &amp; add next</button>
			<a class="apc-btn apc-btn--ghost" href="<?php echo esc_url( $current ); ?>">Clear</a>
		</div>
	</form>
</div>
<script>
(function(){
	var f=document.getElementById('apc_photo'), p=document.getElementById('apc_preview'), t=document.getElementById('apc_file_text');
	if(f){f.addEventListener('change',function(){
		if(f.files&&f.files[0]){ p.src=URL.createObjectURL(f.files[0]); p.style.display='block'; if(t){t.textContent='Change photo';} }
		else{ p.style.display='none'; if(t){t.textContent='Take a photo or upload';} }
	});}
})();
</script>
	<?php
	return ob_get_clean();
}
add_shortcode( 'artpro_capture', 'apc_shortcode_capture' );

/* -------------------------------------------------------------------------
 * 8. SHORTCODE  [artpro_catalog]  — staff catalog list + search + CSV export
 * ---------------------------------------------------------------------- */
function apc_shortcode_catalog() {
	apc_styles();
	$current = apc_current_url();

	if ( ! is_user_logged_in() ) {
		return apc_gate( 'Staff sign-in required', 'Please sign in with your gallery staff account to view the catalog.', wp_login_url( $current ), 'Sign in' );
	}
	if ( ! current_user_can( APC_CAP ) ) {
		return apc_gate( 'No access', 'Your account is not set up as gallery staff.', '', '' );
	}

	$q = isset( $_GET['apc_q'] ) ? sanitize_text_field( wp_unslash( $_GET['apc_q'] ) ) : '';

	$args = array(
		'post_type'      => APC_CPT,
		'post_status'    => 'publish',
		'posts_per_page' => 200,
		'orderby'        => 'date',
		'order'          => 'DESC',
	);
	if ( '' !== $q ) {
		$args['s'] = $q; // searches title; we also match meta below
	}
	$pieces = get_posts( $args );

	// If searching, also include meta matches (artist / catalogue ID).
	if ( '' !== $q ) {
		$meta_ids = get_posts( array(
			'post_type'      => APC_CPT,
			'post_status'    => 'publish',
			'posts_per_page' => 200,
			'fields'         => 'ids',
			'meta_query'     => array(
				'relation' => 'OR',
				array( 'key' => '_apc_artist', 'value' => $q, 'compare' => 'LIKE' ),
				array( 'key' => '_apc_cat_id', 'value' => $q, 'compare' => 'LIKE' ),
			),
		) );
		if ( $meta_ids ) {
			$have = wp_list_pluck( $pieces, 'ID' );
			foreach ( $meta_ids as $id ) {
				if ( ! in_array( $id, $have, true ) ) {
					$pieces[] = get_post( $id );
				}
			}
		}
	}

	$export_url = add_query_arg( array(
		'apc_export' => 'csv',
		'_apcnonce'  => wp_create_nonce( 'apc_export' ),
	), $current );

	// Find the capture page (any page containing the capture shortcode) for the "Add" button.
	$add_url = '';
	$add_page = get_posts( array( 'post_type' => 'page', 'posts_per_page' => 1, 's' => 'artpro_capture', 'fields' => 'ids' ) );
	if ( $add_page ) {
		$add_url = get_permalink( $add_page[0] );
	}

	ob_start();
	?>
<div class="apc">
	<p class="apc__kicker">Staff · Bill of materials</p>
	<h2 class="apc__title">Art catalog</h2>

	<div class="apc-toolbar">
		<form class="apc-search" method="get" action="<?php echo esc_url( $current ); ?>">
			<input type="text" name="apc_q" value="<?php echo esc_attr( $q ); ?>" placeholder="Search name, artist or ID…">
			<button class="apc-btn apc-btn--ghost" type="submit">Search</button>
		</form>
		<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
			<span class="apc-count"><?php echo count( $pieces ); ?> piece<?php echo 1 === count( $pieces ) ? '' : 's'; ?></span>
			<?php if ( $add_url ) : ?><a class="apc-btn apc-btn--ghost" href="<?php echo esc_url( $add_url ); ?>">+ Add a piece</a><?php endif; ?>
			<a class="apc-btn" href="<?php echo esc_url( $export_url ); ?>">Export BOM (CSV)</a>
		</div>
	</div>

	<?php if ( empty( $pieces ) ) : ?>
		<div class="apc-table-wrap"><p class="apc-empty"><?php echo '' !== $q ? 'No pieces match that search.' : 'No pieces captured yet.'; ?></p></div>
	<?php else : ?>
		<div class="apc-table-wrap">
			<table class="apc-table">
				<thead><tr><th>Photo</th><th>Catalogue ID</th><th>Piece name</th><th>Artist</th><th>Art size</th><th>Frame size</th><th>Captured</th></tr></thead>
				<tbody>
				<?php foreach ( $pieces as $p ) : ?>
					<tr>
						<td><?php echo has_post_thumbnail( $p->ID ) ? get_the_post_thumbnail( $p->ID, array( 54, 54 ) ) : '—'; ?></td>
						<td><?php echo esc_html( get_post_meta( $p->ID, '_apc_cat_id', true ) ?: '—' ); ?></td>
						<td><?php echo esc_html( get_the_title( $p ) ); ?></td>
						<td><?php echo esc_html( get_post_meta( $p->ID, '_apc_artist', true ) ?: '—' ); ?></td>
						<td><?php echo esc_html( get_post_meta( $p->ID, '_apc_art_size', true ) ?: '—' ); ?></td>
						<td><?php echo esc_html( get_post_meta( $p->ID, '_apc_frame_size', true ) ?: '—' ); ?></td>
						<td><?php echo esc_html( get_the_date( 'Y-m-d', $p ) ); ?></td>
					</tr>
				<?php endforeach; ?>
				</tbody>
			</table>
		</div>
	<?php endif; ?>
</div>
	<?php
	return ob_get_clean();
}
add_shortcode( 'artpro_catalog', 'apc_shortcode_catalog' );

/* -------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */
function apc_gate( $title, $msg, $link, $link_label ) {
	ob_start();
	?>
<div class="apc"><div class="apc-gate">
	<p class="apc__kicker">Staff only</p>
	<h2 class="apc__title"><?php echo esc_html( $title ); ?></h2>
	<p style="max-width:46ch;margin:0 auto 18px;color:var(--muted);"><?php echo esc_html( $msg ); ?></p>
	<?php if ( $link ) : ?><a class="apc-btn" href="<?php echo esc_url( $link ); ?>"><?php echo esc_html( $link_label ); ?></a><?php endif; ?>
</div></div>
	<?php
	return ob_get_clean();
}

function apc_current_url() {
	// Prefer the queried page's permalink (works with any permalink structure).
	$id = get_queried_object_id();
	if ( $id && get_post_type( $id ) === 'page' ) {
		$link = get_permalink( $id );
		if ( $link ) {
			return $link;
		}
	}
	global $wp;
	$path = isset( $wp->request ) ? $wp->request : '';
	return home_url( trailingslashit( $path ) );
}
