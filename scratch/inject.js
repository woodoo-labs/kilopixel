const fs = require('fs');
const targetFile = 'docs/gradients.html';
const galleryHtml = fs.readFileSync('scratch/gallery.html', 'utf8');

let html = fs.readFileSync(targetFile, 'utf8');
const searchString = `        </div>

      </div>
    </main>`;

if (html.includes(searchString)) {
    html = html.replace(searchString, `        </div>

${galleryHtml}

      </div>
    </main>`);
    fs.writeFileSync(targetFile, html);
    console.log("Successfully injected gallery!");
} else {
    console.log("Could not find insertion point!");
}
