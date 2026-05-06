export const ADMIN_CSS = `
/* ════════════════════════════════════════════════════════════════
   CF-WordPress Admin CSS  — WordPress-identical layout
   ════════════════════════════════════════════════════════════════ */

/* ── Reset / Base ────────────────────────────────────────────── */
*,*::before,*::after{box-sizing:border-box}
:root{
  --wp-blue:#2271b1;--wp-blue-dark:#135e96;--wp-blue-light:#d0e6f7;
  --wp-green:#00a32a;--wp-red:#d63638;--wp-orange:#f0b849;
  --wp-bg:#f0f0f1;--wp-white:#fff;--wp-border:#c3c4c7;
  --wp-text:#1d2327;--wp-muted:#646970;--wp-sidebar:#1e1e1e;
  --wp-sidebar-text:#f0f0f1;--wp-sidebar-hover:#2c3338;
  --wp-sidebar-active:#72aee6;--wp-bar:#1e1e1e;
  --wp-bar-text:#f0f0f1;--wp-bar-hover:#2c3338;
  --adminbar-height:32px;
}
html{font-size:13px;line-height:1.4em;overflow-x:hidden}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif;
  font-size:13px;line-height:1.4em;color:var(--wp-text);background:var(--wp-bg);
  min-height:100vh;padding-top:var(--adminbar-height)}
a{color:var(--wp-blue);text-decoration:none}
a:hover{color:var(--wp-blue-dark)}
img{max-width:100%;height:auto}

/* ── Admin bar ───────────────────────────────────────────────── */
#wpadminbar{
  position:fixed;top:0;left:0;right:0;height:var(--adminbar-height);
  background:var(--wp-bar);z-index:99999;
  font-size:13px;line-height:var(--adminbar-height);min-width:600px;
  direction:ltr;color:var(--wp-bar-text)
}
#wpadminbar *{box-sizing:border-box}
#wpadminbar a,#wpadminbar span{color:var(--wp-bar-text);text-decoration:none}
#wpadminbar a:hover{color:#72aee6}
#wpadminbar .quicklinks{display:flex;height:100%}
#wp-toolbar{display:flex;align-items:center;list-style:none;margin:0;padding:0;height:100%}
#wp-toolbar > li{display:flex;align-items:center;height:100%;position:relative}
#wp-toolbar > li > a{display:flex;align-items:center;height:100%;padding:0 8px;font-size:13px;cursor:pointer}
#wp-toolbar > li > a:hover,#wp-toolbar > li:hover > a{background:var(--wp-bar-hover);color:#72aee6}
#wp-toolbar > li:hover .ab-sub-wrapper{display:block}
.ab-sub-wrapper{
  display:none;position:absolute;top:100%;left:0;min-width:200px;
  background:#2c3338;box-shadow:0 3px 5px rgba(0,0,0,.2);z-index:1000
}
.ab-submenu{list-style:none;margin:0;padding:0}
.ab-submenu li{border-top:1px solid rgba(255,255,255,.1)}
.ab-submenu li a{display:block;padding:8px 12px;color:#f0f0f1;font-size:13px;line-height:1.4}
.ab-submenu li a:hover{background:#1d2327;color:#72aee6}
#wp-admin-bar-my-account .ab-sub-wrapper{right:0;left:auto}
.ab-icon{margin-right:4px;display:flex;align-items:center}
.ab-icon svg{display:block}
#wp-admin-bar-new-content .ab-label{margin-left:4px}
.awaiting-mod{
  display:inline-block;background:var(--wp-red);color:#fff;
  border-radius:9px;font-size:10px;font-weight:600;
  padding:0 5px;line-height:1.6;min-width:18px;text-align:center;
  margin-left:3px
}

/* ── Main layout ─────────────────────────────────────────────── */
#wpwrap{display:flex;min-height:calc(100vh - var(--adminbar-height))}
#adminmenuwrap{
  position:fixed;top:var(--adminbar-height);bottom:0;left:0;
  width:160px;background:var(--wp-sidebar);overflow-y:auto;overflow-x:hidden;
  z-index:9990;transition:width .2s
}
#adminmenuback,#adminmenuback{display:none}
#wpcontent{
  margin-left:160px;flex:1;min-width:0;
  display:flex;flex-direction:column
}
#wpbody{flex:1;padding:0}
#wpbody-content{padding:0 20px 20px}

/* ── Admin menu ──────────────────────────────────────────────── */
#adminmenu{
  list-style:none;margin:0;padding:0 0 40px;width:160px;
  background:var(--wp-sidebar);clear:both
}
#adminmenu li{position:relative}
#adminmenu li.wp-menu-separator{
  background:rgba(255,255,255,.1);height:1px;
  margin:9px 0 9px 15px;padding:0;cursor:default
}
#adminmenu a.menu-top{
  display:flex;align-items:center;padding:8px 12px;
  color:var(--wp-sidebar-text);font-size:13px;line-height:1.4;
  cursor:pointer;transition:background .15s
}
#adminmenu a.menu-top:hover,#adminmenu li:hover > a.menu-top{
  background:var(--wp-sidebar-hover);color:#72aee6
}
#adminmenu li.current > a.menu-top,#adminmenu li.wp-has-current-submenu > a.menu-top{
  background:var(--wp-sidebar-hover)
}
#adminmenu .wp-menu-image{
  width:28px;height:28px;display:flex;align-items:center;justify-content:center;
  flex-shrink:0;font-size:18px;color:rgba(240,240,241,.6)
}
#adminmenu a.menu-top:hover .wp-menu-image,
#adminmenu li.current .wp-menu-image,
#adminmenu li.wp-has-current-submenu .wp-menu-image{color:var(--wp-sidebar-text)}
#adminmenu .wp-menu-name{flex:1;padding-left:6px;font-size:13px}
.wp-submenu{
  display:none;list-style:none;margin:0;padding:4px 0;
  background:#2c3338;position:static
}
#adminmenu li.wp-has-submenu:hover .wp-submenu,
#adminmenu li.wp-menu-open .wp-submenu{display:block}
.wp-submenu li{padding:0}
.wp-submenu a{
  display:block;padding:6px 12px 6px 36px;color:#c3c4c7;font-size:13px
}
.wp-submenu a:hover,.wp-submenu li.current a{color:#72aee6}
.wp-submenu-head{
  padding:6px 12px 4px;font-size:11px;font-weight:600;
  text-transform:uppercase;color:rgba(240,240,241,.4);letter-spacing:.05em
}
#collapse-button{
  position:fixed;bottom:0;width:160px;background:var(--wp-sidebar);
  border-top:1px solid rgba(255,255,255,.1)
}
#collapse-menu{
  display:block;width:100%;padding:10px 12px;background:none;border:none;
  cursor:pointer;color:#c3c4c7;font-size:13px;text-align:left
}
#collapse-menu:hover{color:#72aee6}

/* ── Dashicons ───────────────────────────────────────────────── */
.dashicons-before::before{font-family:dashicons;display:inline-block;speak:never;
  font-style:normal;font-weight:400;font-variant:normal;text-transform:none;
  -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
.dashicons-dashboard::before{content:"\\f226"}
.dashicons-admin-post::before{content:"\\f109"}
.dashicons-admin-media::before{content:"\\f128"}
.dashicons-admin-page::before{content:"\\f105"}
.dashicons-admin-comments::before{content:"\\f101"}
.dashicons-admin-appearance::before{content:"\\f100"}
.dashicons-admin-plugins::before{content:"\\f106"}
.dashicons-admin-users::before{content:"\\f110"}
.dashicons-admin-tools::before{content:"\\f107"}
.dashicons-admin-settings::before{content:"\\f108"}
.dashicons-admin-network::before{content:"\\f112"}
.dashicons-yes::before{content:"\\f147";color:var(--wp-green)}
.dashicons-no::before{content:"\\f158";color:var(--wp-red)}
.dashicons-edit::before{content:"\\f464"}
.dashicons-trash::before{content:"\\f182"}
.dashicons-plus::before{content:"\\f132"}
.dashicons-minus::before{content:"\\f460"}
.dashicons-migrate::before{content:"\\f548"}
.dashicons-chart-bar::before{content:"\\f185"}
.dashicons-edit-large::before{content:"\\f327"}

/* ── Wrap / headings ─────────────────────────────────────────── */
.wrap{max-width:100%;padding-top:20px}
.wrap h1{font-size:23px;font-weight:400;margin:0 0 20px;padding:9px 0 4px;
  line-height:1.3;color:#1d2327}
.wrap h2{font-size:18px;font-weight:600;margin:1.5em 0 .5em}
.wrap h3{font-size:14px;font-weight:600}
.wp-heading-inline{display:inline-block;margin-right:5px}
.page-title-action{
  display:inline-block;padding:4px 8px;border:1px solid #2271b1;
  border-radius:2px;font-size:13px;color:#2271b1;vertical-align:middle;margin-top:2px
}
.page-title-action:hover{background:#2271b1;color:#fff;border-color:#2271b1}
.subtitle{font-size:14px;color:var(--wp-muted);margin-left:10px}
hr.wp-header-end{border:none;border-top:1px solid var(--wp-border);margin:20px 0}

/* ── Buttons ─────────────────────────────────────────────────── */
.button,.button-secondary{
  display:inline-block;text-decoration:none;cursor:pointer;
  border-width:1px;border-style:solid;border-radius:3px;
  white-space:nowrap;box-sizing:border-box;
  padding:0 10px;line-height:2.15384615;height:30px;
  font-size:13px;vertical-align:middle;
  background:#f6f7f7;border-color:#2271b1 #2271b1 #0a4b78;
  color:#2271b1;text-shadow:none
}
.button:hover,.button-secondary:hover{
  background:#f0f0f1;border-color:#0a4b78;color:#135e96
}
.button-primary{
  background:#2271b1;border-color:#2271b1 #2271b1 #135e96;
  color:#fff;text-shadow:none
}
.button-primary:hover{background:#135e96;border-color:#135e96;color:#fff}
.button-small{height:26px;font-size:11px;padding:0 8px;line-height:2}
.button-large{height:38px;padding:0 16px;font-size:14px}
.button-hero{height:46px;padding:0 36px;font-size:14px}
.button-link{
  background:none;border:none;cursor:pointer;text-decoration:underline;
  color:var(--wp-blue);font-size:inherit;padding:0
}
.button-link-delete{color:var(--wp-red)}
.button:disabled,.button-primary:disabled{opacity:.4;cursor:not-allowed}
.submit{margin-top:1rem;padding-top:.5rem}
p.submit{margin-top:1em;padding-top:.5em;border-top:1px solid #ddd}

/* ── Forms ───────────────────────────────────────────────────── */
.form-table{border-collapse:collapse;width:100%;clear:both;margin-top:1rem}
.form-table th{vertical-align:top;text-align:left;padding:20px 10px 20px 0;
  width:210px;line-height:1.3;font-weight:600;color:#1d2327}
.form-table td{margin-bottom:9px;padding:15px 10px;vertical-align:middle}
.form-table td p.description{margin:6px 0;color:var(--wp-muted);font-style:italic;font-size:12px}
.regular-text,.large-text{width:25rem;max-width:100%}
.small-text{width:50px;text-align:center}
input[type=text],input[type=email],input[type=url],input[type=password],
input[type=number],input[type=search],textarea,select{
  font-family:inherit;font-size:14px;padding:4px 8px;
  border:1px solid var(--wp-border);border-radius:4px;
  background:#fff;color:var(--wp-text);line-height:1.5;
  box-shadow:none;outline:none
}
input[type=text]:focus,input[type=email]:focus,input[type=url]:focus,
input[type=password]:focus,input[type=number]:focus,textarea:focus,select:focus{
  border-color:var(--wp-blue);box-shadow:0 0 0 1px var(--wp-blue);outline:2px solid transparent
}
input[type=checkbox],input[type=radio]{margin:0 4px 0 0}
label{cursor:pointer}
select{padding:3px 24px 3px 8px;background-image:url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
  background-repeat:no-repeat;background-position:right .5rem center;background-size:1.2em;
  -webkit-appearance:none;appearance:none}
.description{font-style:italic;color:var(--wp-muted);font-size:12px}
.field-hint{font-size:12px;color:var(--wp-muted);margin-top:3px}

/* ── Notices ─────────────────────────────────────────────────── */
.notice,.updated,.error,.notice-info,.notice-success,.notice-warning,.notice-error{
  position:relative;padding:1px 12px;margin:5px 15px 2px 20px;border-left:4px solid #00a32a;
  background:#fff;box-shadow:0 1px 1px rgba(0,0,0,.04);border-radius:0 4px 4px 0
}
.notice.is-dismissible{padding-right:38px}
.notice-success,.updated{border-left-color:#00a32a}
.notice-warning{border-left-color:#dba617}
.notice-error,.error{border-left-color:#d63638}
.notice-info{border-left-color:#2271b1}
.notice p,.notice ul{margin:.5em 0;padding:0}

/* ── List tables ─────────────────────────────────────────────── */
.wp-list-table{
  border-spacing:0;width:100%;clear:both;margin:0;
  border:1px solid var(--wp-border);background:#fff;border-radius:0
}
.wp-list-table th,.wp-list-table td{
  padding:8px 10px;vertical-align:top;word-wrap:break-word;
  font-size:13px;line-height:1.5
}
.wp-list-table thead th,.wp-list-table tfoot th{
  background:#f6f7f7;border-bottom:1px solid var(--wp-border);font-weight:600;
  cursor:pointer;white-space:nowrap
}
.wp-list-table.striped tbody tr:nth-child(odd){background:#f6f7f7}
.wp-list-table tbody tr:hover{background:#f0f6fc}
.wp-list-table td.column-primary{font-weight:600}
.row-actions{
  font-size:12px;color:var(--wp-muted);visibility:hidden;
  display:flex;flex-wrap:wrap;gap:4px;margin-top:3px
}
.wp-list-table tr:hover .row-actions,.row-actions.visible{visibility:visible}
.row-actions span a{color:var(--wp-muted)}
.row-actions span a:hover{color:var(--wp-blue)}
.check-column{width:2.2em;padding:6px 0 22px}
.check-column input{margin:0}
.tablenav{display:flex;align-items:center;justify-content:space-between;
  padding:8px 0;min-height:50px;clear:both}
.tablenav .actions{display:flex;align-items:center;gap:6px}
.tablenav-pages{display:flex;align-items:center;gap:6px;font-size:13px}
.tablenav-pages-navspan,.page-numbers{
  display:inline-block;min-width:30px;min-height:30px;line-height:30px;
  text-align:center;border:1px solid var(--wp-border);border-radius:3px;padding:0 6px
}
.tablenav-pages-navspan.button.disabled{opacity:.4}
.current-page{width:40px;text-align:center;padding:2px 4px}
.displaying-num{font-size:13px;color:var(--wp-muted)}
.subsubsub{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:0;font-size:13px}
.subsubsub li{margin:0}
.subsubsub li::after{content:" |";color:var(--wp-border);padding:0 4px}
.subsubsub li:last-child::after{content:""}
.subsubsub a{color:var(--wp-blue)}.subsubsub a.current{color:var(--wp-text);font-weight:600}
.subsubsub .count{color:var(--wp-muted)}

/* ── Search box ──────────────────────────────────────────────── */
.search-box{float:right;margin:0 0 8px}
.search-box input[type=search]{margin-right:5px;width:200px}

/* ── Dashboard ───────────────────────────────────────────────── */
#dashboard-widgets-wrap{display:flex;gap:20px;flex-wrap:wrap;margin-top:10px}
#postbox-container-1,#postbox-container-2{flex:1;min-width:280px}
.postbox{
  background:#fff;border:1px solid var(--wp-border);border-radius:4px;
  margin-bottom:20px;overflow:hidden
}
.postbox-header{
  display:flex;align-items:center;justify-content:space-between;
  padding:8px 12px;border-bottom:1px solid var(--wp-border);background:#fff
}
.postbox-header h2,.postbox-header h3{margin:0;font-size:14px;font-weight:600}
.postbox .inside{padding:12px}
.handlediv{background:none;border:none;cursor:pointer;color:var(--wp-muted);padding:4px}
.welcome-panel{padding:5px}
.welcome-panel-content{padding:15px}
.welcome-panel-column-container{display:flex;gap:20px;flex-wrap:wrap;margin-top:15px}
.welcome-panel-column{flex:1;min-width:200px}
.welcome-panel-column ul{margin:.5em 0;padding-left:1.2em}
.welcome-panel-column li{margin:.4em 0}
#dashboard_right_now ul{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:10px}
#dashboard_right_now ul li{flex:0 0 calc(50% - 5px)}
#dashboard_right_now ul li a{display:flex;align-items:center;gap:6px;padding:6px 8px;
  border-radius:3px;color:var(--wp-text)}
#dashboard_right_now ul li a:hover{background:#f0f6fc}
#quick-press input[type=text],#quick-press textarea{
  width:100%;margin-bottom:10px;display:block
}
#quick-press textarea{height:80px;resize:vertical}
.versions{margin-top:10px;padding-top:10px;border-top:1px solid var(--wp-border);font-size:12px}

/* ── Card ────────────────────────────────────────────────────── */
.card{
  background:#fff;border:1px solid var(--wp-border);border-radius:4px;
  padding:20px;margin-bottom:20px;max-width:800px
}
.card h2{margin-top:0}

/* ── Plugins page ────────────────────────────────────────────── */
.plugins .active{background:#eaf2ea}
.plugins .inactive{background:#fff}
.plugins td.column-name{width:15em}
.plugins td.column-description{width:100%}
.plugins .plugin-title strong{font-size:14px}
.plugins .plugin-description p{margin:.3em 0}
.plugins .plugin-version-author-uri{font-size:12px;color:var(--wp-muted);margin-top:4px}
.plugins .row-actions{visibility:visible}

/* Plugin install grid */
.plugins-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:15px;padding:15px 0}
.plugin-card{background:#fff;border:1px solid var(--wp-border);border-radius:4px;overflow:hidden}
.plugin-card-top{padding:15px}
.plugin-card-bottom{
  display:flex;justify-content:space-between;align-items:center;
  padding:10px 15px;background:#f6f7f7;border-top:1px solid var(--wp-border)
}
.plugin-card h3{font-size:14px;margin:0 0 8px}
.plugin-card .action-links{margin-bottom:8px}
.column-rating{color:var(--wp-orange)}
.column-downloaded{font-size:12px;color:var(--wp-muted)}

/* Upload plugin */
.upload-plugin{background:#fff;border:1px solid var(--wp-border);padding:20px;border-radius:4px;max-width:600px}

/* ── Media ───────────────────────────────────────────────────── */
.attachments-browser{flex:1;padding:15px;overflow-y:auto}
.attachments{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px}
.attachments .attachment{
  width:162px;height:162px;background:#f0f0f1;border:4px solid transparent;
  cursor:pointer;position:relative;border-radius:2px;overflow:hidden
}
.attachments .attachment:hover{border-color:var(--wp-blue)}
.attachments .attachment .thumbnail{width:100%;height:100%;display:flex;align-items:center;justify-content:center}
.attachments .attachment img{max-width:100%;max-height:100%;object-fit:cover}
#wp-media-grid .wp-filter{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--wp-border);margin-bottom:15px}
.filter-links{list-style:none;margin:0;padding:0;display:flex;gap:10px}
.filter-links a{color:var(--wp-blue);font-size:13px}.filter-links a.current{font-weight:600;color:var(--wp-text)}

/* ── Themes ──────────────────────────────────────────────────── */
.theme-browser{overflow:hidden}
.themes{display:flex;flex-wrap:wrap;gap:20px;padding:10px 0}
.theme{
  background:#fff;border:4px solid transparent;width:calc(33.333% - 15px);
  box-shadow:0 1px 4px rgba(0,0,0,.2);cursor:pointer;position:relative;
  border-radius:2px;overflow:hidden;transition:border-color .15s
}
.theme:hover{border-color:var(--wp-blue)}
.theme.active{border-color:var(--wp-blue)}
.theme-screenshot{height:200px;background:#f0f0f1;overflow:hidden}
.theme-screenshot img{width:100%;height:100%;object-fit:cover}
.theme-author{padding:10px 15px;font-size:13px;background:#fff}
.theme-actions{padding:0 15px 15px}
.more-details{
  position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
  background:rgba(0,0,0,.7);color:#fff;padding:8px 14px;border-radius:2px;
  font-size:13px;display:none;white-space:nowrap
}
.theme:hover .more-details{display:block}
.wp-filter{display:flex;align-items:center;justify-content:space-between;
  border-bottom:1px solid var(--wp-border);margin-bottom:20px;padding-bottom:10px}
.wp-filter .filter-links{display:flex;gap:1em;list-style:none;margin:0;padding:0}
.wp-filter .filter-links a{font-size:14px;color:var(--wp-blue)}
.wp-filter .filter-links a.current{color:var(--wp-text);font-weight:600;box-shadow:0 -3px var(--wp-blue) inset}
.search-form input[type=search]{width:220px}

/* ── Users ───────────────────────────────────────────────────── */
.users .column-username{width:15em}
.users .column-role{width:10em}
.users .column-posts{width:4em;text-align:center}
.users .column-email{width:15em}

/* ── Comments ────────────────────────────────────────────────── */
.comments .comment-item.unapproved{background:#fff8e5}
.comments td.author{width:14em}
.comments td.comment{width:100%}
.comments td.response{width:10em}
.comments td.date{width:8em}

/* ── Nav menus ───────────────────────────────────────────────── */
#nav-menus-frame{display:flex;gap:20px}
#menu-management-liquid{flex:1}
.nav-tabs-wrapper{border-bottom:1px solid var(--wp-border);margin-bottom:15px}
.nav-tabs{list-style:none;margin:0;padding:0;display:flex}
.nav-tabs li a{display:block;padding:8px 16px;color:var(--wp-blue);border:1px solid transparent;border-bottom:none;margin-bottom:-1px}
.nav-tabs .tabs a{background:#fff;border-color:var(--wp-border) var(--wp-border) #fff;color:var(--wp-text);font-weight:600}
.menu-name{font-size:24px;padding:5px 0}
#menu-name-group{display:flex;align-items:flex-end;gap:10px}
#menu-name-group label{display:block}
#menu-name-group input{font-size:18px;padding:5px;margin-top:5px}
#post-body{display:flex;gap:20px}
#post-body-content{flex:1}
.menu{border:1px solid var(--wp-border);min-height:200px;padding:10px;background:#f0f0f1}
.menu-item{background:#fff;border:1px solid var(--wp-border);padding:10px;margin:4px 0;cursor:move}
.menu-settings{margin-top:20px;padding-top:20px;border-top:1px solid var(--wp-border)}
#postbox-container-1{width:220px;flex-shrink:0}

/* ── Widgets ─────────────────────────────────────────────────── */
.widget-liquid-left{float:left;width:calc(100% - 280px)}
.widget-liquid-right{float:right;width:260px}
.widget{background:#fff;border:1px solid var(--wp-border);margin:0 0 10px;padding:10px}
.widget-top{display:flex;align-items:center;justify-content:space-between}
.widget-title h3{margin:0;font-size:13px;font-weight:600}
.inner-sidebar{min-height:100px;background:#f0f0f1;padding:10px;border:1px solid var(--wp-border)}
.sidebar-name h2{font-size:14px;margin:0 0 10px;padding-bottom:8px;border-bottom:1px solid var(--wp-border)}

/* ── Meta boxes (in editor) ──────────────────────────────────── */
#ai-blog-writer-container{font-size:13px}
.ai-blog-tabs{display:flex;border-bottom:1px solid var(--wp-border);margin-bottom:10px}
.ai-blog-tab{flex:1;padding:6px;border:none;background:none;cursor:pointer;font-size:12px;border-bottom:2px solid transparent}
.ai-blog-tab.active{color:var(--wp-blue);border-bottom-color:var(--wp-blue)}
.ai-blog-tab-content{display:none}.ai-blog-tab-content.active{display:block}
.ai-blog-input-group{margin-bottom:10px}
.ai-blog-input-group label{display:block;font-weight:600;margin-bottom:4px;font-size:12px}
.ai-blog-input-group input,.ai-blog-input-group select,.ai-blog-input-group textarea{
  width:100%;font-size:13px;border:1px solid var(--wp-border);border-radius:3px;padding:4px 6px
}
#ai-thumb-preview img{width:100%;border-radius:3px;margin-top:8px}

/* WP Rocket admin */
.wpr-admin .wpr-header{display:flex;align-items:center;gap:15px;margin-bottom:20px}
.wpr-tabs{display:flex;gap:0;border-bottom:2px solid #e0e0e0;margin-bottom:20px}
.wpr-tab{padding:8px 16px;text-decoration:none;color:var(--wp-muted);font-size:13px;border-bottom:2px solid transparent;margin-bottom:-2px}
.wpr-tab.active{color:var(--wp-blue);border-bottom-color:var(--wp-blue);font-weight:600}
.wpr-section h2{font-size:16px;margin-bottom:15px}

/* Bridge migration */
.bridge-migration-wrap .bridge-tabs{display:flex;gap:5px;margin-bottom:20px}
.bridge-tab{padding:8px 16px;border:1px solid var(--wp-border);background:#fff;
  cursor:pointer;border-radius:3px;font-size:13px}
.bridge-tab.active{background:var(--wp-blue);color:#fff;border-color:var(--wp-blue)}
.bridge-tab-content{display:none}
.bridge-tab-content.active{display:block}
#bridge-export-progress,#bridge-import-progress{margin-top:10px;font-size:13px}

/* Alpack admin */
.alpack-admin .nav-tab-wrapper{display:flex;border-bottom:1px solid var(--wp-border);margin-bottom:20px}
.alpack-admin .nav-tab{
  display:inline-block;padding:6px 14px;font-size:13px;
  border:1px solid transparent;border-bottom:none;cursor:pointer;text-decoration:none;color:var(--wp-blue)
}
.alpack-admin .nav-tab-active{background:#fff;border-color:var(--wp-border) var(--wp-border) #fff;
  color:var(--wp-text);margin-bottom:-1px;font-weight:600}

/* ── Footer ──────────────────────────────────────────────────── */
#wpfooter{
  border-top:1px solid var(--wp-border);background:var(--wp-bg);
  padding:10px 20px;display:flex;justify-content:space-between;font-size:12px;color:var(--wp-muted)
}
#wpfooter a{color:var(--wp-muted)}
#wpfooter a:hover{color:var(--wp-blue)}

/* ── Responsive ──────────────────────────────────────────────── */
@media(max-width:960px){
  #adminmenuwrap{width:36px;overflow:hidden}
  #adminmenuwrap:hover{width:160px;z-index:9999}
  #wpcontent{margin-left:36px}
  #adminmenu .wp-menu-name{display:none}
  #adminmenuwrap:hover #adminmenu .wp-menu-name{display:block}
  #collapse-button{display:none}
}
@media(max-width:600px){
  :root{--adminbar-height:46px}
  #adminmenuwrap{top:46px}
  .form-table th{display:block;width:100%;padding:10px 0 0}
  .form-table td{display:block;padding:5px 0 15px}
  .themes .theme{width:100%}
  .welcome-panel-column{flex:0 0 100%}
}

/* ── Misc utilities ──────────────────────────────────────────── */
.clear{clear:both}
.wp-clearfix::after{content:"";display:table;clear:both}
.hidden{display:none!important}
.screen-reader-text{
  clip:rect(1px,1px,1px,1px);position:absolute!important;
  height:1px;width:1px;overflow:hidden
}
.spinner{
  display:inline-block;width:20px;height:20px;vertical-align:middle;
  background:url(/wp-admin/images/spinner-2x.gif) center/20px no-repeat transparent
}
.spinner.is-active{display:inline-block}
.metabox-holder{width:100%}
.postbox-container{width:100%}
.if-js-closed .inside{display:none}
.woo-placeholder{background:linear-gradient(135deg,#7f54b3,#a57fd3);color:#fff;padding:20px;border-radius:4px}
.widefat{width:100%}
.fixed{table-layout:fixed}
.wp-list-table.fixed th,.wp-list-table.fixed td{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.no-items td{text-align:center;padding:20px;color:var(--wp-muted)}
.colspanchange{padding:20px;text-align:center;color:var(--wp-muted)}
`;
