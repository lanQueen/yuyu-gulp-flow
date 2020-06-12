// 引入需要的 gulp 模块
const {src, dest, series, parallel, watch} = require('gulp');
// 自动加载 gulp 插件
const loadPlugins = require('gulp-load-plugins');
const $ = loadPlugins();
const path = require('path');
// 清除文件模块
const del = require('del');
// 热更新
const browserSync = require('browser-sync');
// 创建服务器
const bs = browserSync.create();

// 将 css 自动转化成兼容各个浏览器
const autoprefixer = require('autoprefixer');

// css 自动排序，保存后自动排序
const Comb = require('csscomb');
// javascript standard style
const standard = require('standard')


// 命令行解析
const minimist = require('minimist');
// 解析指令后面的内容
const argv = minimist(process.argv.slice(2));
// 判断是否是生产环境
const isProd = process.env.NODE_ENV
  ? process.env.NODE_ENV === 'production'
  : argv.production || argv.prod || false;


// cwd 表示从项目的当前目录查找
const cwd = process.cwd();
// 设置默认 config, 默认 data
let config = {
    build: {
        dest: 'dist'
    }
};
let data = {};

// 引入 pages.config.js，防止引入错误设置默认配置和 try...catch
try {
    const { loadConfig, loadData } = require(`${cwd}/pages.config.js`);
    config = Object.assign({}, config, loadConfig);
    data = Object.assign({}, data, loadData);
} catch (e) {}




// 清除指定文件
const clean = () => {
    return del([config.temp, config.dest]);
}

// css/js 检查
const lint = done => {
    const comb = new Comb(require(`${cwd}/.csscomb.json`));
    comb.processPath(config.src);
    const cwds = path.join(__dirname, config.src);
    standard.lintFiles(config.paths.scripts, { cwds, fix: true }, done);
}

/* 
    转换 scss 文件，先放到临时目录 temp

    cwd: config.src   // 设置查找目录
    sourcemaps:!isProd   // 非生产环境下生产 sourcemap 文件
    $.if(isProd, $.cleanCss())： 如果是生产环境，进行压缩
    $.sourcemaps：生成 sourcemaps 文件
    autoprefixer：兼容浏览器样式
        overrideBrowserslist: ['last 2 versions'] // 兼容主流浏览器的最新两个版本
        cascade: false  // 是否美化属性值 默认：true
            美化前，样式缩进
                -webkit-animation: beat 0.4s ease-in-out infinite;
                animation: beat 0.4s ease-in-out infinite;
            美化后，样式缩进
                -webkit-animation: beat 0.4s ease-in-out infinite;
                        animation: beat 0.4s ease-in-out infinite;
 */

const style = () => {
    return src(config.paths.styles, { 
                base: config.src, 
                cwd: config.src,
                sourcemaps:!isProd  
            })
            .pipe($.sass({ outputStyle: 'expanded' }))
            .pipe($.if(isProd, $.cleanCss()))
            .pipe($.postcss([ autoprefixer({
                overrideBrowserslist: ['last 2 versions']
            }) ]))
            .pipe(dest(config.temp, { sourcemaps: '.' }))
            .pipe(bs.reload({ stream: true }));
}

// 转换 js 文件，先放到临时目录 temp
// gulp-plumber 是防止因gulp插件的错误而导致管道中断，plumber可以阻止 gulp 插件发生错误导致进程退出并输出错误日志
const script = () => {
    return src(config.paths.scripts, { 
                base: config.src, 
                cwd: config.src,
                sourcemaps:!isProd  
            })
            .pipe($.babel({ presets: ['@babel/preset-env'] }))
            .pipe($.if(isProd, $.uglify()))
            .pipe(dest(config.temp, {sourcemaps: '.'}))
            .pipe(bs.reload({ stream: true }));
}

// 转换 page 文件，替换模板数据，将 swig 模板引擎缓存机制设置为不缓存，先放到临时目录 temp
const page = () => {
    return src(config.paths.pages, { 
                base: config.src, 
                cwd: config.src
            })
            .pipe($.swig({ data, defaults: { cache: false } }))
            .pipe(dest(config.temp))
            .pipe(bs.reload({ stream: true }));
}

// 压缩图片
const image = () => {
    return src(config.paths.images, { 
                base: config.src, 
                cwd: config.src
            })
            .pipe($.imagemin())
            .pipe(dest(config.dest));
}
// 压缩字体文件
const font = () => {
    return src(config.paths.fonts, { 
                base: config.src, 
                cwd: config.src
            })
            .pipe($.imagemin())
            .pipe(dest(config.dest));
}

// 拷贝额外文件
const extra = () => {
    return src('**', { 
                base: config.public, 
                cwd: config.public
            })
            .pipe(dest(config.dest));
}

/* 
    plugins: [`bs-html-injector?files[]=${config.temp}/*.html`] ？？？
    
 */
// 开发阶段任务：热更新开发服务器
const devServer = () => {
    // 开发阶段需要监控 html/js/css 文件，一旦变化立即执行对应任务
    // 对应任务里设置了 bs.reload，任务一旦执行就会触发浏览器重新加载
    watch(config.paths.styles, { cwd: config.src }, style),
    watch(config.paths.scripts, { cwd: config.src }, script),
    watch(config.paths.pages, { cwd: config.src }, page),

    // 开发阶段不需要压缩 image、 fonts 和拷贝 public 目录，不需要执行对应任务
    // 此处只需要监控这些文件，这些文件一旦变化，浏览器就重新加载
    watch([
        config.paths.images,
        config.paths.fonts
    ], { cwd: config.src },  bs.reload);
    watch('**', { cwd: config.public }, bs.reload);

    // 初始化服务器
    bs.init({
        notify: false, // 关闭提示
        open: argv.open === undefined ? false : argv.open,  // 启动后手动打开浏览器
        port: argv.port === undefined ? 2080 : argv.port,   // 端口号
        // 如果对应任务里使用 bs.reload，浏览器会自动重新加载，此处的 files 可以不需要
        // files: 'temp/**',   // 监控 dist 下文件，一旦修改页面就更新
        server: {
            // 启动浏览器后，会根据 baseDir 目录查找文件
            baseDir: [config.temp, config.src, config.public],  
            // 路由映射，routes 下配置的目录优先于 baseDir 配置的目录
            routes: {
                '/node_modules': 'node_modules',  // 键名是需要匹配的路径，键值是匹配到的路径
            }
        }
    })
}

// 打包后构建服务器
const distServer = () => {
    bs.init({
        notify: false,
        open: argv.open === undefined ? false : argv.open,  
        port: argv.port === undefined ? 2080 : argv.port,   
        server: config.dest
    })
}

// 生产环境需要的任务：文件引用处理，此处只需要处理临时目录下的 html 页面内的文件引用处理
// 此处只压缩了 html 页面文件引用的 js 和 css 文件，其他的 js,css 文件也需要压缩
const useref = () => {
    return src(config.paths.pages, { 
                base: config.temp, 
                cwd: config.temp
            })
            .pipe($.useref({ searchPath: ['.', '..'] }))
            .pipe($.if(/\.js$/, $.uglify()))
            .pipe($.if(/\.css$/, $.cleanCss()))
            .pipe($.if(/\.html$/, $.htmlmin({
                collapseWhitespace: true,
                minifyJS: true,
                minifyCSS: true
            })))
            .pipe(dest(config.dest))
}

// 上传到服务器
const upload = () => {
    return src('**', { cwd: config.dest })
            .pipe(
                $.ghPages({
                    cacheDir: `${config.temp}/publish`,
                    branch: argv.branch === undefined ? 'gh-pages' : argv.branch,
                    remoteUrl: "https://github.com/lanQueen/github-pages-demo.git"
                })
            )
}

// 设置打包文件大小
const measure = () => {
  return src('**', { cwd: config.dest })
            .pipe(
                $.size({
                    title: `${isProd ? 'Prodcuction' : 'Development'} mode build`,
                    gzip: true
                })
            )
}

// 并行组合，编译 src 下需要经常变动的文件
const compile = parallel(style, script, page);


// 串行任务：开发阶段需要执行的任务
const serve = series(compile, devServer);

// 串并行结合组合任务：上线之前执行的任务
const build = series(
    clean,
    parallel(
        series(compile, useref),
        image,
        font, 
        extra
    ),
    measure
);

// 测试打包后数据
const start = series(build, distServer);

// 发布到生产
const deploy = series(build, upload);


// 导出任务 
module.exports = {
    clean,
    lint,
    serve,
    build,
    start,
    deploy
}
