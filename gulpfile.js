// gulpfile.js (modern Gulp 5)
// - Downloads vendor JS (once), normalize.css, and now fonts+CSS (Google Fonts, FontAwesome, Devicon)
// - SCSS from _scss/, JS from _js/, icons from _icons/, images from _images/
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
    browserSync.init({ server: { baseDir: '_site' }, notify: false });
    cb();
  })(done);
}

/* -------------------- Fetch Normalize (auto-fetch) -------------------- */
async function fetchNormalize() {
  const url = 'https://cdnjs.cloudflare.com/ajax/libs/normalize/8.0.1/normalize.min.css';
  const destPath = '_scss/_normalize.scss';
  try {
    const response = await axios.get(url);
    const content = `/* Auto-fetched normalize.css */\n${response.data}`;
    await fsExtra.outputFile(destPath, content);
  } catch (err) {
    console.warn('Warning: failed to fetch normalize.css — continuing with placeholder.', err.message || err);
    await fsExtra.outputFile(destPath, '/* normalize fetch failed — placeholder */\n');
  }
}

/* -------------------- Vendor scripts (download once at build) -------------------- */
async function generateVendorIncludes() {
  const vendorDir = path.join('assets', 'js', 'vendor');
  await fsExtra.ensureDir(vendorDir);

  const vendors = [
    {
      url: 'https://cdn.jsdelivr.net/npm/particles.js@2.0.0/particles.js',
      filename: 'particles.js'
    },
    {
      url: 'https://cdn.jsdelivr.net/npm/sweet-scroll@4.0.0/sweet-scroll.min.js',
      filename: 'sweet-scroll.min.js'
    }
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

  // generate include that references local vendor scripts
  const includePath = path.join('_includes', 'vendor-scripts.html');
  const lines = [
    '<!-- Auto-generated local vendor scripts -->',
    ...vendors.map(v => `<script src="{{ "/assets/js/vendor/${v.filename}" | relative_url }}"></script>`),
    ''
  ];
  await fsExtra.outputFile(includePath, lines.join('\n'));
}

/* -------------------- Fonts + CSS (one-time build downloads) -------------------- */
/**
 * For each provider:
 * - fetch the provider CSS
 * - parse url(...) occurrences for fonts
 * - download each font into assets/fonts/
 * - rewrite CSS to point to /assets/fonts/<filename>
 * - write rewritten CSS to assets/css/<provider>.css
 * - finally write _includes/fonts.html linking local CSS files (relative_url)
 *
 * Providers included: Google Fonts (Roboto 400/700), FontAwesome (6.5.0), Devicon (2.15.1)
 */
const FONT_ASSETS_DIR = path.join('assets', 'fonts');
const FONT_CSS_DIR = path.join('assets', 'css');

async function fetchFonts() {
  await fsExtra.ensureDir(FONT_ASSETS_DIR);
  await fsExtra.ensureDir(FONT_CSS_DIR);

  // provider definitions (versioned)
  const providers = [
    {
      name: 'google-fonts',
      // Roboto 400 & 700 used as example; change family string if you prefer different fonts
      cssUrl: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap',
      // cssOut will be assets/css/google-fonts.css
      cssOut: path.join(FONT_CSS_DIR, 'google-fonts.css'),
      // for Google Fonts the font URLs are absolute to fonts.gstatic.com, so no baseUrl required
      baseUrl: null
    },
    {
      name: 'fontawesome',
      // pinned FontAwesome (free) version
      cssUrl: 'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css',
      cssOut: path.join(FONT_CSS_DIR, 'fontawesome.css'),
      // base for relative assets referenced inside the CSS
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
    // idempotent: skip provider if CSS output already exists (assume fonts already downloaded)
    if (fs.existsSync(p.cssOut)) {
      console.log(`Skipping ${p.name}: ${p.cssOut} already exists.`);
      continue;
    }

    let cssText;
    try {
      const resp = await axios.get(p.cssUrl, { responseType: 'text' });
      cssText = resp.data;
    } catch (err) {
      console.warn(`Warning: failed to fetch CSS for ${p.name} from ${p.cssUrl}: ${err.message || err}`);
      continue; // don't fail build
    }

    // collect font URLs
    const fontsToDownload = [];
    let m;
    while ((m = urlRegex.exec(cssText)) !== null) {
      let urlStr = m[1].trim();

      // ignore data: URIs
      if (urlStr.startsWith('data:')) continue;

      // convert protocol-relative to https
      if (urlStr.startsWith('//')) urlStr = 'https:' + urlStr;

      // if absolute URL, use as-is; otherwise, resolve against baseUrl if provided
      let absoluteUrl;
      if (/^https?:\/\//i.test(urlStr)) {
        absoluteUrl = urlStr;
      } else if (p.baseUrl) {
        // strip leading ../ or ./ segments and join with baseUrl
        const cleaned = urlStr.replace(/^(\.\/|\.\.\/)+/, '');
        absoluteUrl = p.baseUrl.endsWith('/') ? p.baseUrl + cleaned : p.baseUrl + '/' + cleaned;
      } else {
        // if no baseUrl and it's relative, we can't resolve it — skip
        console.warn(`Warning: cannot resolve relative font URL "${urlStr}" for provider ${p.name}; skipping.`);
        continue;
      }

      const filename = path.basename(absoluteUrl.split('?')[0].split('#')[0]);
      fontsToDownload.push({ absoluteUrl, filename, original: m[1] });
    }

    // download fonts (skip already existing files)
    for (const f of fontsToDownload) {
      const outFontPath = path.join(FONT_ASSETS_DIR, f.filename);
      if (fs.existsSync(outFontPath)) {
        // already present
        continue;
      }
      try {
        const resp = await axios.get(f.absoluteUrl, { responseType: 'arraybuffer' });
        await fsExtra.outputFile(outFontPath, Buffer.from(resp.data));
        console.log(`Downloaded font ${f.filename} for ${p.name}`);
      } catch (err) {
        console.warn(`Warning: failed to download font ${f.absoluteUrl}: ${err.message || err}`);
        // continue; don't fail build
      }
    }

    // rewrite CSS to point to local assets
    const rewritten = cssText.replace(urlRegex, (match, urlPath) => {
      if (urlPath.startsWith('data:')) return match;
      const filename = path.basename(urlPath.split('?')[0].split('#')[0]);
      if (/\.(woff2?|ttf|eot|svg)$/i.test(filename)) {
        // point to absolute site-root asset path so Jekyll's relative_url can be used in HTML
        return `url("/assets/fonts/${filename}")`;
      }
      return match;
    });

    // write CSS to assets/css/<provider>.css
    try {
      await fsExtra.outputFile(p.cssOut, rewritten);
      console.log(`Wrote provider CSS: ${p.cssOut}`);
    } catch (err) {
      console.warn(`Warning: failed to write CSS for ${p.name}: ${err.message || err}`);
    }
  }

  // generate _includes/fonts.html linking to the local CSS files (use relative_url)
  const includePath = path.join('_includes', 'fonts.html');
  const linkLines = [
    '<!-- Auto-generated local font CSS includes -->',
    providers.map(p => `<link rel="stylesheet" href="{{ "/assets/css/${path.basename(p.cssOut)}" | relative_url }}">`).join('\n'),
    ''
  ].join('\n');
  await fsExtra.outputFile(includePath, linkLines);
  console.log(`Wrote ${includePath}`);
}

/* -------------------- SCSS -------------------- */
async function styles() {
  // ensure normalize exists (preBuild runs it too, but keep safe)
  await fetchNormalize();
  return src('_scss/**/*.scss')
    .pipe(plumber())
    .pipe(gulpSass().on('error', gulpSass.logError))
    .pipe(csso())
    .pipe(dest('assets/css/'))
    .pipe(browserSync.stream());
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
function icons() {
  const iconDir = '_icons';
  if (!fs.existsSync(iconDir) || fs.readdirSync(iconDir).length === 0) return Promise.resolve();
  return src('_icons/**/*.{svg,png}')
    .pipe(dest('assets/icons/'));
}

/* -------------------- Watch -------------------- */
function watchFiles() {
  watch('_scss/**/*.scss', series(styles, jekyllRebuild));
  watch('_js/**/*.js', series(scripts, jekyllRebuild));
  watch('_images/**/*.{jpg,jpeg,png,gif}', series(images, jekyllRebuild));
  watch('_icons/**/*.{svg,png}', series(icons, jekyllRebuild));
  watch(['*.html', '_includes/*.html', '_layouts/*.html'], jekyllRebuild);
}

/* -------------------- Build / Default -------------------- */
// preBuild: fetch normalize, generate vendor includes (JS), and fetch fonts+CSS
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
