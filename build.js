const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const VERSION = '0.1.0';

const files = [
  'js/engine.js',
  'js/compiler.js',
  'js/graphics.js',
  'js/monitor.js',
  'js/elements/stage.js',
  'js/elements/layer.js',
  'js/elements/group.js',
  'js/elements/shape.js',
  'js/elements/shapes/circle.js',
  'js/elements/shapes/ellipse.js',
  'js/elements/shapes/rect.js',
  'js/elements/shapes/line.js',
  'js/elements/shapes/polyline.js',
  'js/elements/shapes/text.js',
  'js/elements/variable.js'
];

function build() {
  console.log('Concatenating and minifying framework files...');
  
  try {
    // 1. Read and concatenate all files
    let code = '';
    for (const file of files) {
      const filePath = path.join(__dirname, file);
      if (!fs.existsSync(filePath)) {
        console.error(`Error: Could not find file: ${file}`);
        process.exit(1);
      }
      code += fs.readFileSync(filePath, 'utf8') + '\n';
    }

    // Inject version into the code
    code = `/** Kilopixel Framework v${VERSION} */\n` + code.replace('window.pxl = {};', `window.pxl = { version: '${VERSION}' };`);

    // 2. Ensure dist/ directory exists
    const distDir = path.join(__dirname, 'dist');
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir);
    }

    // 3. Write a temporary file for Terser to process
    const tempPath = path.join(distDir, 'temp_concat.js');
    fs.writeFileSync(tempPath, code, 'utf8');

    // 4. Minify using npx terser
    const outputPath = path.join(distDir, `kilopixel-v${VERSION}.min.js`);
    console.log(`Running global Terser for v${VERSION} (this may take a second)...`);
    
    // This executes terser on the command line
    execSync(`npx terser "${tempPath}" --compress passes=2 --mangle -o "${outputPath}"`, { stdio: 'inherit' });

    // 5. Clean up temp file
    fs.unlinkSync(tempPath);

    // Calculate sizes
    const minifiedCode = fs.readFileSync(outputPath, 'utf8');
    const originalSize = (Buffer.byteLength(code, 'utf8') / 1024).toFixed(2);
    const minifiedSize = (Buffer.byteLength(minifiedCode, 'utf8') / 1024).toFixed(2);
    
    console.log('\n✅ Build successful!');
    console.log(`Original size: ${originalSize} KB`);
    console.log(`Minified size: ${minifiedSize} KB`);
    console.log(`Saved to: ${outputPath}`);

  } catch (err) {
    console.error('\nBuild failed:', err.message);
    process.exit(1);
  }
}

build();
