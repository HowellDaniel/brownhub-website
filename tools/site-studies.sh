#!/bin/zsh
# tools/site-studies.sh — rebuild the four layout studies on index.html#layouts.
# They used to be illustrations drawn in SVG. These are real pages: four small demo
# sites, rendered by headless Chrome at the exact served size (800x600 CSS px, shot
# at 2x so the JPEG lands crisp). Nothing here is served or linked; the pages exist
# only to be photographed, so the repo keeps no extra URLs and no dictionary keys.
#
# Each design is scaled to 80% inside its own canvas, leaving a plain bleed. The
# card it lands in scales every picture to 1.16 for the parallax drift (and 1.25 on
# hover), which would otherwise cut 7% off all four edges — harmless on a photo, but
# these are interfaces with words against the margin. At 80% the hover crop just
# reaches the design's own edge and the resting frame shows it whole.
#
#   tools/site-studies.sh            writes images/web/{landing,shop,dashboard,booking}.jpg
#   tools/site-studies.sh /tmp/out   writes the four JPEGs somewhere else to look at
set -u
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
OUT=${1:-images/web}
TMP=$(mktemp -d /tmp/bhstudies.XXXXXX)
trap 'rm -rf "$TMP"' EXIT

# ---------- 1. landing: a chop bar ----------
cat > "$TMP/landing.html" <<'HTML'
<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
html{background:#fdf7ef}
body{width:800px;height:600px;overflow:hidden;transform:scale(.8);transform-origin:50% 50%;font-family:-apple-system,"Helvetica Neue",sans-serif;background:#fdf7ef;color:#221812}
nav{display:flex;align-items:center;justify-content:space-between;padding:18px 40px;font-size:13px}
.brand{font-weight:800;letter-spacing:-.2px;font-size:16px}
.brand span{color:#c2410c}
.links{display:flex;gap:22px;color:#6b5648}
.links b{color:#221812}
.cta{background:#c2410c;color:#fff;padding:9px 16px;border-radius:999px;font-weight:600}
.hero{display:flex;gap:34px;align-items:center;padding:14px 40px 0}
h1{font-size:44px;line-height:1.03;letter-spacing:-1.4px;font-weight:800}
h1 em{font-style:normal;color:#c2410c}
p.lead{margin-top:14px;font-size:14.5px;line-height:1.6;color:#6b5648;max-width:330px}
.btns{margin-top:20px;display:flex;gap:10px}
.b1{background:#221812;color:#fdf7ef;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600}
.b2{border:1.5px solid #d9c8b8;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;color:#4a3a2f}
.plate{width:308px;height:250px;border-radius:18px;background:
 radial-gradient(circle at 50% 46%, #f7e3c4 0 34%, transparent 35%),
 linear-gradient(150deg,#8a3c12,#c2410c 46%,#e8794a);position:relative;box-shadow:0 18px 34px -18px rgba(90,40,10,.5)}
.plate:after{content:"";position:absolute;inset:26px;border-radius:50%;border:1px dashed rgba(255,255,255,.5)}
.plate b{position:absolute;left:22px;bottom:18px;background:#fffdf9;color:#5b3a1f;font-size:11px;padding:6px 11px;border-radius:999px}
.cards{display:flex;gap:14px;padding:26px 40px 0}
.c{flex:1;background:#fff;border:1px solid #efe1d0;border-radius:14px;padding:16px}
.c i{display:block;width:30px;height:30px;border-radius:9px;background:#fbe9dc;color:#c2410c;font-style:normal;font-weight:700;font-size:13px;display:grid;place-items:center}
.c h4{margin:11px 0 5px;font-size:13.5px}
.c p{font-size:11.5px;line-height:1.55;color:#7c6555}
.strip{margin:24px 40px 0;background:#221812;color:#f4e9dd;border-radius:14px;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;font-size:12.5px}
.strip span{color:#c9b39c}
</style></head><body>
<nav><div class="brand">Kontomantse <span>Grill</span></div>
<div class="links"><b>Menu</b><span>Orders</b></span><span>Visit</span><span>About</span></div><div class="cta">Order now</div></nav>
<div class="hero"><div><h1>Charcoal, spice<br>and <em>proper</em><br>Accra portions.</h1>
<p class="lead">Khebab, jollof and grilled tilapia cooked to order from 4pm. Pay on delivery inside East Legon, Tema and Osu.</p>
<div class="btns"><div class="b1">See tonight's menu</div><div class="b2">Chat an order</div></div></div>
<div class="plate"><b>Open till 11pm</b></div></div>
<div class="cards">
<div class="c"><i>1</i><h4>Order on WhatsApp</h4><p>Send the list, we confirm the total and the time in minutes.</p></div>
<div class="c"><i>2</i><h4>Rider inside 30 min</h4><p>Own riders for East Legon, Osu, Cantonments and Tema Community 25.</p></div>
<div class="c"><i>3</i><h4>Pay how you like</h4><p>MoMo, card at the door or a transfer for the office order.</p></div></div>
<div class="strip"><b>Friday platter — 4 people, everything grilled</b><span>GH&#8373;320 · order by 6pm</span></div>
</body></html>
HTML

# ---------- 2. shop: an online catalog ----------
cat > "$TMP/shop.html" <<'HTML'
<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
html{background:#fff}
body{width:800px;height:600px;overflow:hidden;transform:scale(.8);transform-origin:50% 50%;font-family:-apple-system,"Helvetica Neue",sans-serif;background:#fff;color:#101418}
header{display:flex;align-items:center;gap:16px;padding:16px 26px;border-bottom:1px solid #e8ebef}
.logo{font-weight:800;font-size:15px;letter-spacing:-.3px}
.search{flex:1;background:#f3f5f8;border-radius:9px;padding:9px 13px;font-size:12px;color:#8a94a1;display:flex;justify-content:space-between}
.pill{background:#0f766e;color:#fff;font-size:12px;font-weight:600;padding:9px 14px;border-radius:9px}
.wrap{display:flex;height:536px}
aside{width:158px;border-right:1px solid #e8ebef;padding:18px 0 0 18px;font-size:12px;color:#4c5764}
aside h5{font-size:10.5px;letter-spacing:.9px;text-transform:uppercase;color:#9aa4b0;margin-bottom:9px}
aside ul{list-style:none;margin:0 0 20px;padding:0;line-height:2.05}
aside .on{color:#0f766e;font-weight:700}
main{flex:1;padding:18px 26px}
.tops{display:flex;gap:8px;margin-bottom:14px}
.chip{border:1px solid #dfe4ea;border-radius:999px;padding:6px 12px;font-size:11.5px;color:#4c5764}
.chip.on{background:#101418;color:#fff;border-color:#101418}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:13px}
.card{border:1px solid #e8ebef;border-radius:12px;overflow:hidden}
.img{height:104px;position:relative}
.a{background:linear-gradient(140deg,#fde68a,#f59e0b)}
.b{background:linear-gradient(140deg,#bbf7d0,#059669)}
.c{background:linear-gradient(140deg,#bfdbfe,#2563eb)}
.d{background:linear-gradient(140deg,#fbcfe8,#db2777)}
.e{background:linear-gradient(140deg,#ddd6fe,#7c3aed)}
.f{background:linear-gradient(140deg,#fed7aa,#ea580c)}
.tag{position:absolute;left:8px;top:8px;background:rgba(255,255,255,.92);font-size:9.5px;font-weight:700;padding:3px 7px;border-radius:5px;color:#101418}
.body{padding:9px 10px 11px}
.body h4{font-size:12px;font-weight:600;line-height:1.3}
.price{margin-top:5px;font-size:13px;font-weight:800}
.price s{margin-left:5px;font-size:10.5px;color:#9aa4b0;font-weight:500}
.buy{margin-top:8px;background:#f3f5f8;border-radius:7px;text-align:center;font-size:11px;font-weight:600;padding:6px 0;color:#101418}
</style></head><body>
<header><div class="logo">Adom Fabrics</div>
<div class="search"><span>Search 246 items</span><span>&#8981;</span></div><div class="pill">Chat to order</div></header>
<div class="wrap"><aside>
<h5>Category</h5><ul><li class="on">All fabrics</li><li>Wax print</li><li>Slub &amp; linen</li><li>Kente strips</li><li>Beads &amp; trims</li></ul>
<h5>Price</h5><ul><li>Under GH&#8373;100</li><li>GH&#8373;100 &ndash; 300</li><li>Above GH&#8373;300</li></ul>
<h5>Delivery</h5><ul><li>Accra same day</li><li>Nationwide</li></ul>
</aside><main>
<div class="tops"><div class="chip on">New in</div><div class="chip">Best sellers</div><div class="chip">By the yard</div><div class="chip">Ready to wear</div></div>
<div class="grid">
<div class="card"><div class="img a"><span class="tag">6 YARDS</span></div><div class="body"><h4>Real wax print, 6 yards</h4><div class="price">GH&#8373;240</div><div class="buy">Add to chat</div></div></div>
<div class="card"><div class="img b"><span class="tag">IN STOCK</span></div><div class="body"><h4>Slub linen, stone grey</h4><div class="price">GH&#8373;160 <s>190</s></div><div class="buy">Add to chat</div></div></div>
<div class="card"><div class="img c"><span class="tag">NEW</span></div><div class="body"><h4>Hand-woven kente strips</h4><div class="price">GH&#8373;420</div><div class="buy">Add to chat</div></div></div>
<div class="card"><div class="img d"></div><div class="body"><h4>Crepe chiffon, rose</h4><div class="price">GH&#8373;95</div><div class="buy">Add to chat</div></div></div>
<div class="card"><div class="img e"><span class="tag">-15%</span></div><div class="body"><h4>Casablanca satin lining</h4><div class="price">GH&#8373;120 <s>140</s></div><div class="buy">Add to chat</div></div></div>
<div class="card"><div class="img f"></div><div class="body"><h4>Bead set, gold &amp; onyx</h4><div class="price">GH&#8373;75</div><div class="buy">Add to chat</div></div></div>
</div></main></div></body></html>
HTML

# ---------- 3. dashboard: an internal web app ----------
cat > "$TMP/dashboard.html" <<'HTML'
<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
html{background:#0f172a}
body{width:800px;height:600px;overflow:hidden;transform:scale(.8);transform-origin:50% 50%;font-family:-apple-system,"Helvetica Neue",sans-serif;background:#0f172a;color:#e2e8f0}
.wrap{display:flex;height:600px}
aside{width:150px;background:#0b1220;padding:16px 0;border-right:1px solid #1e293b;font-size:11.5px}
.brand{display:flex;gap:7px;align-items:center;padding:0 14px 16px;font-weight:700;font-size:12.5px;color:#fff}
.brand i{width:18px;height:18px;border-radius:6px;background:#38bdf8;display:block}
.group{padding:12px 14px 4px;font-size:9.5px;letter-spacing:.9px;text-transform:uppercase;color:#64748b}
.item{padding:7px 14px;color:#94a3b8;display:flex;justify-content:space-between}
.item.on{background:#132038;color:#fff;border-left:2px solid #38bdf8}
.item b{color:#38bdf8;font-size:10px}
main{flex:1;padding:14px 18px;overflow:hidden}
.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.top h1{font-size:15px;font-weight:700;color:#fff}
.top .sub{font-size:10.5px;color:#64748b;margin-top:2px}
.tools{display:flex;gap:7px;font-size:10.5px}
.tool{background:#1e293b;padding:6px 10px;border-radius:7px;color:#cbd5e1}
.tool.go{background:#0284c7;color:#fff;font-weight:600}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}
.kpi{background:#111c31;border:1px solid #1e293b;border-radius:10px;padding:10px 11px}
.kpi span{font-size:9.5px;color:#64748b;letter-spacing:.4px}
.kpi b{display:block;font-size:18px;color:#fff;margin:3px 0 2px;letter-spacing:-.5px}
.kpi u{text-decoration:none;font-size:9.5px;color:#34d399}
.kpi d{font-size:9.5px;color:#f87171;font-size:9.5px}
.cols{display:flex;gap:9px;margin-top:9px}
.panel{background:#111c31;border:1px solid #1e293b;border-radius:10px;padding:11px}
.panel h3{font-size:11px;color:#cbd5e1;font-weight:600;margin-bottom:9px}
.bars{display:flex;align-items:flex-end;gap:7px;height:104px}
.bars i{flex:1;background:linear-gradient(180deg,#38bdf8,#0369a1);border-radius:3px 3px 0 0;display:block}
.bars em{position:absolute}
.rows{display:flex;flex-direction:column;gap:9px}
.r{display:flex;align-items:center;gap:8px;font-size:10.5px;color:#94a3b8}
.r span{width:64px;color:#cbd5e1}
.r i{flex:1;height:6px;background:#1e293b;border-radius:3px;display:block;overflow:hidden}
.r b{display:block;height:6px;background:linear-gradient(90deg,#0ea5e9,#38bdf8);border-radius:3px}
.r em{font-style:normal;width:56px;text-align:right;color:#64748b}
.xs{display:flex;justify-content:space-between;font-size:8.5px;color:#475569;margin-top:6px}
table{width:100%;border-collapse:collapse;font-size:10.5px}
th{text-align:left;color:#64748b;font-weight:500;padding-bottom:6px;font-size:9.5px;letter-spacing:.5px;text-transform:uppercase}
td{padding:6px 0;border-top:1px solid #1e293b;color:#cbd5e1}
.st{font-size:9px;padding:2px 6px;border-radius:5px}
.ok{background:rgba(52,211,153,.14);color:#34d399}
.wait{background:rgba(251,191,36,.14);color:#fbbf24}
.run{background:rgba(56,189,248,.14);color:#38bdf8}
</style></head><body><div class="wrap">
<aside><div class="brand"><i></i>Nima Logistics</div>
<div class="group">Operations</div>
<div class="item on">Dashboard</div><div class="item">Deliveries <b>18</b></div><div class="item">Drivers</div><div class="item">Vehicles</div>
<div class="group">Money</div><div class="item">Invoices</div><div class="item">Cash on delivery</div>
<div class="group">Setup</div><div class="item">Zones</div><div class="item">Staff logins</div></aside>
<main><div class="top"><div><h1>Tuesday operations</h1><div class="sub">Accra + Tema zones · updated 2 min ago</div></div>
<div class="tools"><div class="tool">Last 7 days</div><div class="tool">Export CSV</div><div class="tool go">New delivery</div></div></div>
<div class="kpis">
<div class="kpi"><span>DELIVERIES TODAY</span><b>142</b><u>+18 vs Mon</u></div>
<div class="kpi"><span>ON-TIME RATE</span><b>94.2%</b><u>+2.1 pts</u></div>
<div class="kpi"><span>OPEN DRIVERS</span><b>23</b><d>3 idle</d></div>
<div class="kpi"><span>UNCOLLECTED CASH</span><b>GH&#8373;6,480</b><d>7 overdue</d></div></div>
<div class="cols">
<div class="panel" style="width:288px"><h3>Parcels per hour</h3>
<div class="bars"><i style="height:28%"></i><i style="height:44%"></i><i style="height:38%"></i><i style="height:66%"></i><i style="height:82%"></i><i style="height:57%"></i><i style="height:71%"></i><i style="height:93%"></i><i style="height:48%"></i></div>
<div class="xs"><span>7am</span><span>noon</span><span>6pm</span></div></div>
<div class="panel" style="flex:1"><h3>Needs your attention</h3>
<table><tr><th>Waybill</th><th>Driver</th><th>Zone</th><th>Status</th></tr>
<tr><td>NG-4412</td><td>K. Mensah</td><td>Osu</td><td><span class="st wait">Awaiting cash</span></td></tr>
<tr><td>NG-4408</td><td>Self</td><td>Tema 25</td><td><span class="st run">On route</span></td></tr>
<tr><td>NG-4399</td><td>A. Yeboah</td><td>Adenta</td><td><span class="st ok">Delivered</span></td></tr>
<tr><td>NG-4395</td><td>Unassigned</td><td>East Legon</td><td><span class="st wait">Not picked</span></td></tr>
<tr><td>NG-4390</td><td>R. Owusu</td><td>Spintex</td><td><span class="st ok">Delivered</span></td></tr></table></div></div>
<div class="cols" style="margin-top:9px">
<div class="panel" style="width:288px"><h3>Driver utilisation</h3>
<div class="rows"><div class="r"><span>K. Mensah</span><i><b style="width:92%"></b></i><em>18 drops</em></div>
<div class="r"><span>A. Yeboah</span><i><b style="width:78%"></b></i><em>15 drops</em></div>
<div class="r"><span>R. Owusu</span><i><b style="width:64%"></b></i><em>12 drops</em></div>
<div class="r"><span>T. Armah</span><i><b style="width:41%"></b></i><em>8 drops</em></div>
<div class="r"><span>Self</span><i><b style="width:24%"></b></i><em>5 drops</em></div></div></div>
<div class="panel" style="flex:1"><h3>Zone load today</h3>
<table><tr><th>Zone</th><th>Parcels</th><th>Avg. hand-off</th><th>Cash back</th></tr>
<tr><td>Osu</td><td>38</td><td>26 min</td><td>GH&#8373;1,240</td></tr>
<tr><td>East Legon</td><td>31</td><td>41 min</td><td>GH&#8373;1,905</td></tr>
<tr><td>Tema 25</td><td>27</td><td>52 min</td><td>GH&#8373;860</td></tr>
<tr><td>Adenta</td><td>24</td><td>34 min</td><td>GH&#8373;1,120</td></tr>
<tr><td>Spintex</td><td>22</td><td>29 min</td><td>GH&#8373;1,355</td></tr></table></div></div>
</main></div></body></html>
HTML

# ---------- 4. booking: an enquiry and date picker ----------
cat > "$TMP/booking.html" <<'HTML'
<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
html{background:#f6f5f2}
body{width:800px;height:600px;overflow:hidden;transform:scale(.8);transform-origin:50% 50%;font-family:-apple-system,"Helvetica Neue",sans-serif;background:#f6f5f2;color:#1c1917}
.wrap{display:flex;height:600px}
.left{width:352px;background:#fff;padding:26px 28px;border-right:1px solid #e7e5e4}
.brand{font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#a8a29e;margin-bottom:6px}
h1{font-size:23px;letter-spacing:-.6px;line-height:1.15;margin-bottom:6px}
.left p{font-size:12px;line-height:1.6;color:#78716c;margin-bottom:18px}
label{display:block;font-size:11px;font-weight:600;color:#57534e;margin:12px 0 5px}
.f{width:100%;border:1px solid #d6d3d1;border-radius:8px;padding:10px 11px;font-size:12.5px;background:#fcfcfb}
.two{display:flex;gap:9px}.two>div{flex:1}
.days{display:flex;gap:6px;margin-top:6px}
.day{flex:1;border:1px solid #d6d3d1;border-radius:9px;padding:8px 0;text-align:center;font-size:11px;color:#57534e}
.day b{display:block;font-size:14px;color:#1c1917;margin-top:1px}
.day.on{background:#1c1917;border-color:#1c1917;color:#d6d3d1}.day.on b{color:#fff}
.slots{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:6px}
.slot{border:1px solid #d6d3d1;border-radius:7px;padding:7px 0;text-align:center;font-size:11px;color:#57534e}
.slot.on{background:#c2410c;border-color:#c2410c;color:#fff;font-weight:600}
.slot.off{color:#d6d3d1;background:#fafaf9}
.go{margin-top:16px;width:100%;background:#c2410c;color:#fff;border-radius:9px;padding:12px 0;text-align:center;font-size:13px;font-weight:600}
.note{margin-top:8px;font-size:10.5px;color:#a8a29e;text-align:center}
.right{flex:1;padding:26px 24px;background:linear-gradient(165deg,#1c1917,#2d2723)}
.rc{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:15px 16px;color:#f5f5f4}
.rc h3{font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:#a8a29e;margin-bottom:11px}
.row{display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.08);color:#d6d3d1}
.row b{color:#fff}
.tot{display:flex;justify-content:space-between;font-size:14px;font-weight:700;color:#fff;margin-top:11px}
.mini{margin-top:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:14px 16px;color:#e7e5e4;font-size:11.5px;line-height:1.6}
.mini b{display:block;font-size:12.5px;color:#fff;margin-bottom:4px}
.mini span{color:#fdba74}
.map{margin-top:14px;height:186px;border-radius:12px;position:relative;overflow:hidden;
 background:repeating-linear-gradient(90deg,#3f3a36 0 1px,transparent 1px 34px),repeating-linear-gradient(0deg,#3f3a36 0 1px,transparent 1px 34px),#46403b}
.map i{position:absolute;left:44%;top:38%;width:11px;height:11px;border-radius:50%;background:#c2410c;box-shadow:0 0 0 6px rgba(194,65,12,.28)}
.map b{position:absolute;left:12px;bottom:12px;background:rgba(28,25,23,.86);color:#e7e5e4;font-size:10.5px;padding:6px 10px;border-radius:7px;font-weight:500}
.stamp{margin-top:12px;display:flex;gap:8px;align-items:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:12px 14px;color:#a8a29e;font-size:11px}
.stamp u{text-decoration:none;color:#fff;font-weight:700;font-size:13px}
.stamp s{margin-left:auto;text-decoration:none;color:#fdba74;font-size:11px;font-weight:600}
</style></head><body><div class="wrap">
<div class="left"><div class="brand">Aseda Hair &amp; Beauty</div>
<h1>Book a chair in six taps</h1><p>Choose a day, pick a time, leave your WhatsApp number. We hold the slot for 30 minutes after it opens.</p>
<label>Full name</label><div class="f">Akosua Frimpong</div>
<div class="two"><div><label>WhatsApp number</label><div class="f">050 295 4541</div></div><div><label>Service</label><div class="f">Braids + fit</div></div></div>
<label>Date</label><div class="days"><div class="day">Thu<b>8</b></div><div class="day on">Fri<b>9</b></div><div class="day">Sat<b>10</b></div><div class="day">Mon<b>12</b></div></div>
<label>Time</label><div class="slots"><div class="slot off">08:00</div><div class="slot off">09:30</div><div class="slot">11:00</div><div class="slot on">12:30</div><div class="slot">14:00</div><div class="slot off">15:30</div><div class="slot">17:00</div><div class="slot">18:30</div></div>
<div class="go">Confirm on WhatsApp</div><div class="note">No deposit · cancel free up to 2 hours before</div></div>
<div class="right"><div class="rc"><h3>Your appointment</h3>
<div class="row"><span>Friday 9 October</span><b>12:30</b></div>
<div class="row"><span>Braids + fit (chair 2)</span><b>3 hrs</b></div>
<div class="row"><span>Deposit</span><b>None</b></div>
<div class="tot"><span>Estimate</span><span>GH&#8373;380 &ndash; 450</span></div></div>
<div class="mini"><b>Arrive with dry, unoiled hair</b><span>Bring a reference photo if you have one — it saves ten minutes of guessing.</span></div>
<div class="map"><i></i><b>2nd floor, Osu · 4 min from Accra Mall</b></div>
<div class="stamp"><u>4.9</u> from 214 verified appointments <s>Open now</s></div></div>
</div></body></html>
HTML

# ---------- photograph them ----------
shoot() {
  local name=$1
  rm -rf "$TMP/profile-$name"
  "$CHROME" --headless=new --disable-gpu --no-first-run --hide-scrollbars \
    --user-data-dir="$TMP/profile-$name" --window-size=800,600 --force-device-scale-factor=2 \
    --virtual-time-budget=4000 --screenshot="$TMP/$name.png" "file://$TMP/$name.html" \
    >/dev/null 2>&1 &
  local pid=$!
  local n=0
  while [ ! -s "$TMP/$name.png" ] && [ $n -lt 40 ]; do sleep 0.5; n=$((n+1)); done
  kill -9 $pid 2>/dev/null; pkill -9 -f "profile-$name" 2>/dev/null
  [ -s "$TMP/$name.png" ] || { echo "FAIL $name: chrome produced nothing"; return 1; }
  sips -s format jpeg -s formatOptions 82 -Z 800 "$TMP/$name.png" --out "$OUT/$name.jpg" >/dev/null
  echo "$name.jpg $(stat -f%z "$OUT/$name.jpg") bytes  $(sips -g pixelWidth -g pixelHeight "$OUT/$name.jpg" | awk '/pixel/{printf "%s ", $2}')"
}

mkdir -p "$OUT"
for n in landing shop dashboard booking; do shoot "$n" || exit 1; done
sleep 1
