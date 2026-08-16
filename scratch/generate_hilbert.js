const fs = require('fs');

function hilbertTurtleRelative(order, stepSize) {
    let state = "A";
    for(let i=0; i<order; i++) {
        let nextState = "";
        for(let char of state) {
            if (char === "A") nextState += "-BF+AFA+FB-";
            else if (char === "B") nextState += "+AF-BFB-FA+";
            else nextState += char;
        }
        state = nextState;
    }
    
    let dir = 0; // 0: East, 1: North, 2: West, 3: South
    
    // Relative mode ALWAYS starts drawing from 0,0 (relative to the polyline's x/y)
    let points = ["0,0"];
    
    for(let char of state) {
        if (char === "F") {
            if (dir === 0) points.push(`${stepSize},0`);
            else if (dir === 1) points.push(`0,${stepSize}`);
            else if (dir === 2) points.push(`-${stepSize},0`);
            else if (dir === 3) points.push(`0,-${stepSize}`);
        } else if (char === "+") { // Right turn
            dir = (dir + 3) % 4; 
        } else if (char === "-") { // Left turn
            dir = (dir + 1) % 4;
        }
    }
    return points;
}

const order = 5;
const stepSize = 30; // Clean integer segment length
const points = hilbertTurtleRelative(order, stepSize);
const pointsStr = points.join('; ');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Neon Hilbert Curve - Kilopixel</title>
  <style>
    body { margin: 0; background: #050510; display: flex; flex-direction: column; align-items: center; color: white; font-family: sans-serif; overflow: hidden; }
    pxl-stage { width: 100%; max-width: 90vh; max-height: 90vh; margin-top: 20px; box-shadow: 0 0 50px rgba(0,255,255,0.1); border-radius: 10px; }
    h2 { margin: 10px 0 0 0; font-weight: normal; color: #cbd5e1; font-family: monospace; letter-spacing: 2px; }
    p { color: #475569; font-size: 14px; margin-top: 5px; font-family: monospace; }
  </style>
  <script src="../dist/pxl.min.js"></script>
</head>
<body>
  <h2>HILBERT: TRACE</h2>
  <p>Order 5 // 1024 Nodes // Continuous Fractal Array</p>
  
  <pxl-stage id="main" ratio="1">
    
    <pxl-layer filter="[dropShadow(0,0,10,'#00ffff'), dropShadow(0,0,20,'#ff00ff')]">
      
      <!-- Center the 930x930 curve on the 1000x1000 stage -->
      <!-- 1000 / 2 = 500 center. 930 / 2 = 465 offset. -->
      <!-- The expression compiler evaluates '500 - 465' dynamically! -->
      <pxl-group>
        
        <!-- 1. The faint background path -->
        <pxl-polyline 
          mode="relative"
          x="500 - 465"
          y="500 - 465"
          stroke="rgba(255, 255, 255, 0.05)" 
          strokewidth="4" 
          linejoin="bevel"
          linecap="round"
          fill="none"
          points="${pointsStr}"
        ></pxl-polyline>

        <!-- 2. The Cyan Tracer (Fast) -->
        <pxl-polyline 
          mode="relative"
          x="500 - 465"
          y="500 - 465"
          stroke="#00ffff" 
          strokewidth="4" 
          linejoin="bevel"
          linecap="round"
          fill="none"
          linedash="[750, 32000]"
          dashoffset="-(t * 1800)"
          points="${pointsStr}"
        ></pxl-polyline>

        <!-- 3. The Magenta Tracer (Faster) -->
        <pxl-polyline 
          mode="relative"
          x="500 - 465"
          y="500 - 465"
          stroke="#ff00ff" 
          strokewidth="6" 
          linejoin="bevel"
          linecap="round"
          fill="none"
          linedash="[500, 32000]"
          dashoffset="-(t * 2400) - 1000"
          points="${pointsStr}"
        ></pxl-polyline>

        <!-- 4. The White Tracer (Slow pulse) -->
        <pxl-polyline 
          mode="relative"
          x="500 - 465"
          y="500 - 465"
          stroke="#ffffff" 
          strokewidth="2" 
          linejoin="bevel"
          linecap="round"
          fill="none"
          linedash="[2500, 32000]"
          dashoffset="-(wave(20) * 18000)"
          points="${pointsStr}"
        ></pxl-polyline>

      </pxl-group>

    </pxl-layer>

  </pxl-stage>
</body>
</html>
`;

fs.writeFileSync('examples/test46.html', html);
console.log('Successfully wrote relative mode examples/test46.html');
