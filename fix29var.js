const fs = require('fs');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Pixel - Kinematic Reference Chain</title>
  <style>
    body {
      background: #09090b;
      color: #fafafa;
      font-family: 'Inter', system-ui, sans-serif;
      margin: 0;
      padding: 40px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 30px;
    }
    .hero {
      text-align: center;
      max-width: 800px;
    }
    h1 {
      font-size: 3rem;
      font-weight: 800;
      letter-spacing: -1px;
      background: linear-gradient(to right, #38bdf8, #818cf8, #c084fc);
      -webkit-background-clip: text;
      color: transparent;
      margin: 0 0 15px 0;
    }
    p { color: #a1a1aa; font-size: 1.1rem; line-height: 1.6; margin: 0; }
    
    .demo-container {
      width: 100%;
      max-width: 1200px;
      background: rgba(24, 24, 27, 0.5);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 24px;
      padding: 30px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    pxl-stage {
      border-radius: 16px;
      overflow: hidden;
      background: radial-gradient(circle at center, #18181b 0%, #09090b 100%);
      display: block;
      width: 100%;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05);
    }
  </style>
  <script src="dist/pxl.min.js"></script>
</head>
<body>
  <div class="hero">
    <h1>Kinematic Chain</h1>
    <p>Demonstrating zero-cost <code>ref.</code> attribute tracking. Each node declaratively binds to the exact X/Y position of the previous node in the chain, creating a complex forward kinematics simulation with no JS overhead.</p>
  </div>

  <div class="demo-container">
    <pxl-stage id="main" ratio="16/9">
      
      <!-- Math Engine (Using pxl-var elements) -->
      <pxl-layer>
        <!-- Main Chain Math -->
        <pxl-var id="n0x" value="500"></pxl-var>
        <pxl-var id="n0y" value="ref.main.height / 2"></pxl-var>
        
        <pxl-var id="n1x" value="ref.n0x.value + cos(t * 0.8) * 180"></pxl-var>
        <pxl-var id="n1y" value="ref.n0y.value + sin(t * 0.8) * 180"></pxl-var>
        
        <pxl-var id="n2x" value="ref.n1x.value + cos(t * -1.5) * 130"></pxl-var>
        <pxl-var id="n2y" value="ref.n1y.value + sin(t * -1.5) * 130"></pxl-var>
        
        <pxl-var id="n3x" value="ref.n2x.value + cos(t * 2.2) * 90"></pxl-var>
        <pxl-var id="n3y" value="ref.n2y.value + sin(t * 2.2) * 90"></pxl-var>
        
        <pxl-var id="n4x" value="ref.n3x.value + cos(t * -3.5) * 60"></pxl-var>
        <pxl-var id="n4y" value="ref.n3y.value + sin(t * -3.5) * 60"></pxl-var>
        
        <pxl-var id="n5x" value="ref.n4x.value + cos(t * 5) * 40"></pxl-var>
        <pxl-var id="n5y" value="ref.n4y.value + sin(t * 5) * 40"></pxl-var>

        <!-- Mouse Chain Math -->
        <pxl-var id="m1x" value="ref.main.mouseX + cos(t * 2) * 100"></pxl-var>
        <pxl-var id="m1y" value="ref.main.mouseY + sin(t * 2) * 100"></pxl-var>
        
        <pxl-var id="m2x" value="ref.m1x.value + cos(t * -3) * 60"></pxl-var>
        <pxl-var id="m2y" value="ref.m1y.value + sin(t * -3) * 60"></pxl-var>

        <!-- Grid Background -->
        <pxl-line x1="0" y1="ref.main.height / 2" x2="1000" y2="ref.main.height / 2" stroke="rgba(255,255,255,0.03)" strokewidth="1" />
        <pxl-line x1="500" y1="0" x2="500" y2="ref.main.height" stroke="rgba(255,255,255,0.03)" strokewidth="1" rotate="90" />
      </pxl-layer>

      <!-- Visual Lines Layer (Drawn BEHIND nodes) -->
      <pxl-layer>
        <!-- Main Chain Lines -->
        <pxl-line x1="ref.n0x.value" y1="ref.n0y.value" x2="ref.n1x.value" y2="ref.n1y.value" stroke="rgba(56, 189, 248, 0.6)" strokewidth="3" />
        <pxl-line x1="ref.n1x.value" y1="ref.n1y.value" x2="ref.n2x.value" y2="ref.n2y.value" stroke="rgba(129, 140, 248, 0.6)" strokewidth="3" />
        <pxl-line x1="ref.n2x.value" y1="ref.n2y.value" x2="ref.n3x.value" y2="ref.n3y.value" stroke="rgba(192, 132, 252, 0.6)" strokewidth="3" />
        <pxl-line x1="ref.n3x.value" y1="ref.n3y.value" x2="ref.n4x.value" y2="ref.n4y.value" stroke="rgba(232, 121, 249, 0.6)" strokewidth="3" />
        <pxl-line x1="ref.n4x.value" y1="ref.n4y.value" x2="ref.n5x.value" y2="ref.n5y.value" stroke="rgba(244, 63, 94, 0.6)" strokewidth="3" />
        
        <!-- Mouse Chain Lines -->
        <pxl-line x1="ref.main.mouseX" y1="ref.main.mouseY" x2="ref.m1x.value" y2="ref.m1y.value" stroke="rgba(16, 185, 129, 0.4)" strokewidth="2" />
        <pxl-line x1="ref.m1x.value" y1="ref.m1y.value" x2="ref.m2x.value" y2="ref.m2y.value" stroke="rgba(52, 211, 153, 0.4)" strokewidth="2" />
      </pxl-layer>

      <!-- Visual Nodes Layer (Drawn OVER lines) -->
      <pxl-layer>
        <!-- Main Chain Nodes -->
        <pxl-circle x="ref.n0x.value" y="ref.n0y.value" r="15" fill="#0f172a" stroke="#38bdf8" strokewidth="4" filter="\`drop-shadow(0 0 10px #38bdf8)\`" />
        <pxl-circle x="ref.n1x.value" y="ref.n1y.value" r="12" fill="#0f172a" stroke="#38bdf8" strokewidth="3" filter="\`drop-shadow(0 0 10px #38bdf8)\`" />
        <pxl-circle x="ref.n2x.value" y="ref.n2y.value" r="10" fill="#0f172a" stroke="#818cf8" strokewidth="3" filter="\`drop-shadow(0 0 10px #818cf8)\`" />
        <pxl-circle x="ref.n3x.value" y="ref.n3y.value" r="8" fill="#0f172a" stroke="#c084fc" strokewidth="3" filter="\`drop-shadow(0 0 10px #c084fc)\`" />
        <pxl-circle x="ref.n4x.value" y="ref.n4y.value" r="6" fill="#0f172a" stroke="#e879f9" strokewidth="3" filter="\`drop-shadow(0 0 10px #e879f9)\`" />
        <pxl-circle x="ref.n5x.value" y="ref.n5y.value" r="5" fill="#0f172a" stroke="#f43f5e" strokewidth="3" filter="\`drop-shadow(0 0 10px #f43f5e)\`" />
        
        <!-- End Effector Trace (Visual Only) -->
        <pxl-circle x="ref.n5x.value" y="ref.n5y.value" r="8 + wave(8)*6" fill="#f43f5e" filter="\`drop-shadow(0 0 20px #f43f5e)\`" stroke="none" />

        <!-- Mouse Chain Nodes -->
        <pxl-circle x="ref.main.mouseX" y="ref.main.mouseY" r="0" fill="none" />
        <pxl-circle x="ref.m1x.value" y="ref.m1y.value" r="8" fill="#0f172a" stroke="#10b981" strokewidth="2" />
        <pxl-circle x="ref.m2x.value" y="ref.m2y.value" r="6" fill="#0f172a" stroke="#34d399" strokewidth="2" />
      </pxl-layer>

      <pxl-layer>
        <pxl-text x="20" y="30" text="ref.main.fps + ' FPS'" font="monospace" size="14" fill="#52525b" align="left" stroke="none" />
      </pxl-layer>
    </pxl-stage>
  </div>
</body>
</html>`;

fs.writeFileSync('test29.html', html);
