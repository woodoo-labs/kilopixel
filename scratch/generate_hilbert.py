import sys

def hilbert(x, y, xi, xj, yi, yj, n):
    if n == 0:
        return [(x + (xi + yi)/2.0, y + (xj + yj)/2.0)]
    return (hilbert(x,           y,           yi/2, yj/2, xi/2, xj/2, n - 1) +
            hilbert(x + xi/2,    y + xj/2,    xi/2, xj/2, yi/2, yj/2, n - 1) +
            hilbert(x + xi/2 + yi/2, y + xj/2 + yj/2, xi/2, xj/2, yi/2, yj/2, n - 1) +
            hilbert(x + xi/2 + yi/2, y + xj/2 + yj/2, -yi/2,-yj/2,-xi/2,-xj/2, n - 1))

points = hilbert(0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 5)

# Scale points to 800x800 and center at 0,0
scaled = []
for p in points:
    sx = p[0] * 800 - 400
    sy = p[1] * 800 - 400
    scaled.append(f"{sx:.1f},{sy:.1f}")

points_str = "; ".join(scaled)

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Neon Hilbert Curve - Kilopixel</title>
  <style>
    body {{ margin: 0; background: #050510; display: flex; flex-direction: column; align-items: center; color: white; font-family: sans-serif; overflow: hidden; }}
    pxl-stage {{ width: 100%; max-width: 90vh; max-height: 90vh; margin-top: 20px; box-shadow: 0 0 50px rgba(0,255,255,0.1); border-radius: 10px; }}
    h2 {{ margin: 10px 0 0 0; font-weight: normal; color: #cbd5e1; font-family: monospace; letter-spacing: 2px; }}
    p {{ color: #475569; font-size: 14px; margin-top: 5px; font-family: monospace; }}
  </style>
  <script src="../dist/pxl.min.js"></script>
</head>
<body>
  <h2>HILBERT: TRACE</h2>
  <p>Order 5 // 1024 Nodes // Continuous Fractal Array</p>
  
  <pxl-stage id="main" ratio="1">
    
    <pxl-layer filter="[dropShadow(0,0,10,'#00ffff'), dropShadow(0,0,20,'#ff00ff')]">
      
      <pxl-group x="500" y="500">
        <!-- 1. The faint background path -->
        <pxl-polyline 
          stroke="rgba(255, 255, 255, 0.05)" 
          strokewidth="4" 
          linejoin="round"
          linecap="round"
          fill="none"
          points="{points_str}"
        ></pxl-polyline>

        <!-- 2. The Cyan Tracer (Fast) -->
        <pxl-polyline 
          stroke="#00ffff" 
          strokewidth="4" 
          linejoin="round"
          linecap="round"
          fill="none"
          linedash="600 26000"
          dashoffset="-(t * 1500)"
          points="{points_str}"
        ></pxl-polyline>

        <!-- 3. The Magenta Tracer (Faster) -->
        <pxl-polyline 
          stroke="#ff00ff" 
          strokewidth="6" 
          linejoin="round"
          linecap="round"
          fill="none"
          linedash="400 26000"
          dashoffset="-(t * 2000) - 1000"
          points="{points_str}"
        ></pxl-polyline>

        <!-- 4. The White Tracer (Slow pulse) -->
        <pxl-polyline 
          stroke="#ffffff" 
          strokewidth="2" 
          linejoin="round"
          linecap="round"
          fill="none"
          linedash="2000 26000"
          dashoffset="-(wave(20) * 15000)"
          points="{points_str}"
        ></pxl-polyline>

      </pxl-group>

    </pxl-layer>

  </pxl-stage>
</body>
</html>
"""

with open('examples/test46.html', 'w') as f:
    f.write(html)
