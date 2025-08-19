// gulpfile.js (modern Gulp 5, patched)
// - Downloads vendor JS (once), normalize.css, fonts+CSS (Google Fonts, FontAwesome, Devicon)
// - SCSS from _sass/, JS from _js/, icons from _icons/, images from _images/
const { src, dest, series, parallel, watch } = require('gulp');
const csso = require('gulp-csso');
const terser = require('gulp-terser');
const concat = require('gulp-concat');
const gulpSass = require('gulp-sass')(require('sass'));
const plumber = require('gulp-plumber');
const cp = require('child_process');
const imagemin = require('gulp-imagemin');
const browserSync = require('browser-sync').create();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const fsExtra = require('fs-extra');

const jekyllCommand = (/^win/.test(process.platform)) ? 'jekyll.bat' : 'bundle';

/* -------------------- Jekyll -------------------- */
function jekyllBuild(done) {
  const args = jekyllCommand === 'bundle' ? ['exec', 'jekyll', 'build'] : ['build'];
  return cp.spawn(jekyllCommand, args, { stdio: 'inherit' }).on('close', done);
}

function jekyllRebuild(done) {
  return series(jekyllBuild, (cb) => { browserSync.reload(); cb(); })(done);
}

function serve(done) {
  return series(jekyllBuild, (cb) => {
    browserSync.init({
      server: { baseDir: '_site' },
      notify: false,
      open: false,
      files: false // disable internal BS watcher
    });
    cb();
  })(done);
}

/* -------------------- Fetch Normalize -------------------- */
async function fetchNormalize() {
  const url = 'https://cdnjs.cloudflare.com/ajax/libs/normalize/8.0.1/normalize.min.css';
  const destPath = '_sass/_normalize.scss';
  try {
    const resp = await axios.get(url, { responseType: 'text' });
    const content = `/* Auto-fetched normalize.css */\n${resp.data}`;

    if (fs.existsSync(destPath)) {
      const prev = fs.readFileSync(destPath, 'utf8');
      if (prev === content) return; // unchanged
    }

    await fsExtra.outputFile(destPath, content);
    console.log(`Wrote ${destPath}`);
  } catch (err) {
    console.warn('Warning: failed to fetch normalize.css — continuing with placeholder.', err.message || err);
    if (!fs.existsSync(destPath)) {
      await fsExtra.outputFile(destPath, '/* normalize fetch failed — placeholder */\n');
    }
  }
}

/* -------------------- Vendor scripts -------------------- */
async function generateVendorIncludes() {
  const vendorDir = path.join('assets', 'js', 'vendor');
  await fsExtra.ensureDir(vendorDir);

  const vendors = [
    { url: 'https://cdn.jsdelivr.net/npm/particles.js@2.0.0/particles.js', filename: 'particles.js' },
    { url: 'https://cdn.jsdelivr.net/npm/sweet-scroll@4.0.0/sweet-scroll.min.js', filename: 'sweet-scroll.min.js' }
  ];

  for (const v of vendors) {
    const outPath = path.join(vendorDir, v.filename);
    if (fs.existsSync(outPath)) continue;
    try {
      const resp = await axios.get(v.url, { responseType: 'arraybuffer' });
      await fsExtra.outputFile(outPath, Buffer.from(resp.data));
      console.log(`Downloaded vendor: ${v.filename}`);
    } catch (err) {
      console.warn(`Warning: failed to download ${v.url}: ${err.message || err}`);
    }
  }

  const includePath = path.join('_includes', 'vendor-scripts.html');
  const lines = [
    '<!-- Auto-generated local vendor scripts -->',
    ...vendors.map(v => `<script src="{{ "/assets/js/vendor/${v.filename}" | relative_url }}"></script>`),
    ''
  ];
  const joined = lines.join('\n');

  if (!fs.existsSync(includePath) || fs.readFileSync(includePath, 'utf8') !== joined) {
    await fsExtra.outputFile(includePath, joined);
    console.log(`Wrote ${includePath}`);
  }
}

/* -------------------- Fonts + CSS -------------------- */
const FONT_ASSETS_DIR = path.join('assets', 'fonts');
const FONT_CSS_DIR = path.join('assets', 'css');

async function fetchFonts() {
  await fsExtra.ensureDir(FONT_ASSETS_DIR);
  await fsExtra.ensureDir(FONT_CSS_DIR);

  const providers = [
    {
      name: 'google-fonts',
      cssUrl: 'https://fonts.googleapis.com/css2?' +
        [
		  'family=Roboto',
		  'family=Roboto+Mono',
          'family=Amarante',
          'family=Bahianita',
          'family=Averia+Serif+Libre',
          'family=Barrio',
          'family=Barriecito',
          'family=Bigelow+Rules',
          'family=Bigshot+One',
          'family=Caesar+Dressing',
          'family=Grenze+Gotisch',
          'family=Metal+Mania',
          'family=Megrim',
          'family=Alegreya+SC',
          'family=Ubuntu+Mono'
        ].join('&') +
        '&display=swap',
      cssOut: path.join(FONT_CSS_DIR, 'google-fonts.css'),
      baseUrl: null
    },
    {
      name: 'fontawesome',
      cssUrl: 'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css',
      cssOut: path.join(FONT_CSS_DIR, 'fontawesome.css'),
      baseUrl: 'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/'
    },
    {
      name: 'devicon',
      cssUrl: 'https://cdn.jsdelivr.net/gh/devicons/devicon@2.15.1/devicon.min.css',
      cssOut: path.join(FONT_CSS_DIR, 'devicon.css'),
      baseUrl: 'https://cdn.jsdelivr.net/gh/devicons/devicon@2.15.1/'
    }
  ];

  const urlRegex = /url\((?:'|")?([^'")]+)(?:'|")?\)/gi;

  for (const p of providers) {
    if (fs.existsSync(p.cssOut)) {
      console.log(`Skipping ${p.name}: ${p.cssOut} already exists.`);
      continue;
    }

    let cssText;
    try {
      const resp = await axios.get(p.cssUrl, { responseType: 'text' });
      cssText = resp.data;
    } catch (err) {
      console.warn(`Warning: failed to fetch CSS for ${p.name}: ${err.message || err}`);
      continue;
    }

    const fontsToDownload = [];
    let m;
    while ((m = urlRegex.exec(cssText)) !== null) {
      let urlStr = m[1].trim();
      if (urlStr.startsWith('data:')) continue;
      if (urlStr.startsWith('//')) urlStr = 'https:' + urlStr;

      let absoluteUrl;
      if (/^https?:\/\//i.test(urlStr)) {
        absoluteUrl = urlStr;
      } else if (p.baseUrl) {
        const cleaned = urlStr.replace(/^(\.\/|\.\.\/)+/, '');
        absoluteUrl = p.baseUrl.endsWith('/') ? p.baseUrl + cleaned : p.baseUrl + '/' + cleaned;
      } else {
        console.warn(`Warning: cannot resolve relative font URL "${urlStr}" for provider ${p.name}; skipping.`);
        continue;
      }

      const filename = path.basename(absoluteUrl.split('?')[0].split('#')[0]);
      fontsToDownload.push({ absoluteUrl, filename, original: m[1] });
    }

    for (const f of fontsToDownload) {
      const outFontPath = path.join(FONT_ASSETS_DIR, f.filename);
      if (fs.existsSync(outFontPath)) continue;
      try {
        const resp = await axios.get(f.absoluteUrl, { responseType: 'arraybuffer' });
        await fsExtra.outputFile(outFontPath, Buffer.from(resp.data));
        console.log(`Downloaded font ${f.filename} for ${p.name}`);
      } catch (err) {
        console.warn(`Warning: failed to download font ${f.absoluteUrl}: ${err.message || err}`);
      }
    }

    const rewritten = cssText.replace(urlRegex, (match, urlPath) => {
      if (urlPath.startsWith('data:')) return match;
      const filename = path.basename(urlPath.split('?')[0].split('#')[0]);
      if (/\.(woff2?|ttf|eot|svg)$/i.test(filename)) {
        return `url("/assets/fonts/${filename}")`;
      }
      return match;
    });

    if (!fs.existsSync(p.cssOut) || fs.readFileSync(p.cssOut, 'utf8') !== rewritten) {
      await fsExtra.outputFile(p.cssOut, rewritten);
      console.log(`Wrote provider CSS: ${p.cssOut}`);
    }
  }

  const includePath = path.join('_includes', 'fonts.html');
  const linkLines = [
    '<!-- Auto-generated local font CSS includes -->',
    providers.map(p => `<link rel="stylesheet" href="{{ "/assets/css/${path.basename(p.cssOut)}" | relative_url }}">`).join('\n'),
    ''
  ].join('\n');

  if (!fs.existsSync(includePath) || fs.readFileSync(includePath, 'utf8') !== linkLines) {
    await fsExtra.outputFile(includePath, linkLines);
    console.log(`Wrote ${includePath}`);
  }
}

/* -------------------- SCSS -------------------- */
function styles() {
  return src('_sass/**/*.scss')
    .pipe(plumber())
    .pipe(gulpSass().on('error', gulpSass.logError))
    .pipe(csso())
    .pipe(dest('assets/css/'));
}

/* -------------------- JavaScript -------------------- */
function scripts() {
  return src('_js/**/*.js')
    .pipe(plumber())
    .pipe(concat('main.js'))
    .pipe(terser())
    .pipe(dest('assets/js/'));
}

/* -------------------- Images -------------------- */
function hasImageFiles(dir) {
  if (!fs.existsSync(dir)) return false;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && hasImageFiles(full)) return true;
    if (/\.(jpe?g|png|gif)$/i.test(entry.name)) return true;
  }
  return false;
}

function images() {
  const imgDir = '_images';
  const pattern = `${imgDir}/**/*.{jpg,jpeg,png,gif}`;
  if (!hasImageFiles(imgDir)) return Promise.resolve();
  return src(pattern)
    .pipe(plumber())
    .pipe(imagemin({ optimizationLevel: 3, progressive: true, interlaced: true }))
    .pipe(dest('assets/img/'));
}

/* -------------------- Icons -------------------- */
async function icons() {
  const srcDir = '_icons';
  const outDir = path.join('assets', 'icons');

  if (!fs.existsSync(srcDir)) return;

  await fsExtra.ensureDir(outDir);
  await fsExtra.copy(srcDir, outDir, {
    overwrite: true,
    filter: (src) => {
      // allow directories (so recursion works)
      if (fs.lstatSync(src).isDirectory()) return true;
      // only copy specific file types
      return /\.(png|svg|ico|webmanifest|json)$/i.test(src);
    }
  });

  console.log('Copied icons recursively via fs-extra.copy');
}

/* -------------------- Watch -------------------- */
const watchOpts = {
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 200,
    pollInterval: 100
  }
};

function watchFiles() {
  watch('_sass/**/*.scss', watchOpts, series(styles, jekyllRebuild));
  watch('_js/**/*.js', watchOpts, series(scripts, jekyllRebuild));
  watch('_images/**/*.{jpg,jpeg,png,gif}', watchOpts, series(images, jekyllRebuild));
  watch('_icons/**/*.{svg,png,ico,webmanifest,json}', watchOpts, series(icons, jekyllRebuild));
  watch(['*.html', '_includes/*.html', '_layouts/*.html'], watchOpts, jekyllRebuild);
}

/* -------------------- Build / Default -------------------- */
const preBuild = series(fetchNormalize, generateVendorIncludes, fetchFonts);
const build = series(parallel(scripts, styles, images, icons), preBuild, jekyllBuild);

exports.build = build;
exports.default = series(parallel(scripts, styles, images, icons), preBuild, serve, watchFiles);
exports.serve = series(build, serve);
exports.watch = watchFiles;
exports.styles = styles;
exports.scripts = scripts;
exports.images = images;
exports.icons = icons;
exports.jekyllBuild = jekyllBuild;
exports.fetchFonts = fetchFonts;
