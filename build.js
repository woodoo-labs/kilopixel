const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const VERSION = '0.1.0';

const files = [
  'js/engine.js',
  'js/matrix.js',
  'js/compiler.js',
  'js/interaction.js',
  'js/graphics.js',
  'js/monitor.js',
  'js/elements/stage.js',
  'js/elements/node.js',
  'js/elements/layer.js',
  'js/elements/group.js',
  'js/elements/shape.js',
  'js/elements/shapes/circle.js',
  'js/elements/shapes/ellipse.js',
  'js/elements/shapes/rect.js',
  'js/elements/shapes/line.js',
  'js/elements/shapes/polyline.js',
  'js/elements/shapes/text.js',
  'js/elements/shapes/grid.js',
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

    // 6. Create generic pxl.min.js alias for tests
    const aliasPath = path.join(distDir, 'pxl.min.js');
    fs.copyFileSync(outputPath, aliasPath);

    // 7. Copy alias to docs folder so GitHub Pages has it locally
    const docsJsDir = path.join(__dirname, 'docs', 'js');
    if (fs.existsSync(docsJsDir)) {
      const docsAliasPath = path.join(docsJsDir, 'pxl.min.js');
      fs.copyFileSync(outputPath, docsAliasPath);
    }
    const docsDownloadDir = path.join(__dirname, 'docs', 'download');
    if (!fs.existsSync(docsDownloadDir)) {
      fs.mkdirSync(docsDownloadDir, { recursive: true });
    }
    fs.copyFileSync(outputPath, path.join(docsDownloadDir, 'pxl.min.js'));

    // 8. Generate docs/download/kilopixel-boilerplate.zip from docs/download/index.html
    console.log('Generating boilerplate ZIP archive...');
    const boilerplateTmpDir = path.join(distDir, 'boilerplate_tmp');
    if (fs.existsSync(boilerplateTmpDir)) {
      fs.rmSync(boilerplateTmpDir, { recursive: true, force: true });
    }
    fs.mkdirSync(boilerplateTmpDir);
    const boilerplateJsDir = path.join(boilerplateTmpDir, 'js');
    fs.mkdirSync(boilerplateJsDir);

    // Copy pxl.min.js into boilerplate_tmp/js/
    fs.copyFileSync(outputPath, path.join(boilerplateJsDir, 'pxl.min.js'));

    // Read index.html from docs/download/index.html and adjust script path for zip package
    const boilerplateSourcePath = path.join(docsDownloadDir, 'index.html');
    let boilerplateHtml = fs.readFileSync(boilerplateSourcePath, 'utf8');
    boilerplateHtml = boilerplateHtml.replace('src="pxl.min.js"', 'src="js/pxl.min.js"');
    fs.writeFileSync(path.join(boilerplateTmpDir, 'index.html'), boilerplateHtml, 'utf8');

    const zipOutputPath = path.join(docsDownloadDir, 'kilopixel-boilerplate.zip');
    if (fs.existsSync(zipOutputPath)) {
      fs.unlinkSync(zipOutputPath);
    }

    // Clean up old unused zip locations if present
    const oldDistZip = path.join(distDir, 'kilopixel-boilerplate.zip');
    if (fs.existsSync(oldDistZip)) fs.unlinkSync(oldDistZip);
    const oldDocsZip = path.join(__dirname, 'docs', 'kilopixel-boilerplate.zip');
    if (fs.existsSync(oldDocsZip)) fs.unlinkSync(oldDocsZip);

    execSync(`npx -y bestzip "${zipOutputPath}" *`, { cwd: boilerplateTmpDir, stdio: 'inherit' });
    fs.rmSync(boilerplateTmpDir, { recursive: true, force: true });

    console.log(`Saved boilerplate ZIP to: ${zipOutputPath}`);

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
