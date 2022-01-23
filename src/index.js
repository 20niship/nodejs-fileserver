require('dotenv').config();
var express = require("express");
var app = express();
const fs = require('fs').promises;
let ejs = require("ejs");
const path = require('path');

// ejsファイルの場所を設定
app.set('views', __dirname + "/views")

const INFO  = (str) => { console.log(`\x1b[00m[  INFO   ] ${(new Date()).toISOString()}\t${str}\x1b[0m`) }
const DEBUG = (str) => { console.log(`\x1b[32m[  DEBUG  ] ${(new Date()).toISOString()}\t${str}\x1b[0m`) }
const WARN  = (str) => { console.log(`\x1b[33m[ WARNING ] ${(new Date()).toISOString()}\t${str}\x1b[0m`) }
const ERROR = (str) => { console.log(`\x1b[31m[  ERROR  ] ${(new Date()).toISOString()}\t${str}\x1b[0m`) }

const needLogin = (process.env.needLogin === "true")
const needLoginToEdit = (process.env.needLoginToEdit === "true")

INFO("-----------------------------------------------")
INFO(`env.PORT            = ${process.env.PORT}`)
INFO(`env.ExpireTime      = ${process.env.ExpireTime}`)
INFO(`env.DIR             = ${process.env.DIR}`)
INFO(`env.TRASH_DIR       = ${process.env.TRASH_DIR}`)
INFO(`env.UPLAD_TEMP_DIR  = ${process.env.UPLAD_TEMP_DIR}`)
INFO(`env.FILE_MAX_SIZE  = ${process.env.UPLOAD_FILE_MAX_SIZE}`)
INFO(`env.MAX_CHUNK_SIZE  = ${process.env.UPLOAD_MAX_CHUNK_SIZE}`)
INFO(`env.needLogin       = ${needLogin}`)
INFO(`env.needLoginToEdit = ${needLoginToEdit}`)
INFO("-----------------------------------------------")

// ###################################################################################
// ---------------------------------  ユーザー認証 -------------------------------------
// ###################################################################################
var session = require('express-session');
app.use(session({
	key: 'session_cookie_name',
	secret: 'session_cookie_secret',
	// store: sessionStore,
	resave: false,
	saveUninitialized: false
}));


// Logger
if (process.env.NODE_ENV !== 'production') {
  app.disable('etag') // 304 Not Modifiedレスポンスを返さないようにする
  app.use((req, res, next) => {
    // res.removeHeader("X-Powered-By");
    res.setHeader( 'X-Powered-By', `Awesome Fileserver ver ${process.env.VERSION}`);

    INFO(req.method + "\t" + req.url );
    next();
  })
}

app.get("/", (req, res) => {
  res.redirect("/view")
})

if(needLogin || needLoginToEdit){
  app.get("/login", (req, res) => {
    res.set('Content-Type', 'text/html');
    res.sendFile(`${__dirname}/views/login.html`);
  })

  app.use(express.urlencoded({ extended: true }))
  app.use(express.json()); 
  app.post("/login", async(req, res) => {
    console.log(req.body)
    if(req.body["username"] === process.env.user_name && req.body["password"] === process.env.user_password){
      req.session.regenerate(err => {
        if(err){ERROR("Error : " + err);res.status(500).end();return;}
        req.session.username = req.body["username"] ;
        res.redirect("/view")
      })
    }else{
      ERROR("login password compare failed")
      res.status(500).send("Username or password wrong registered");
    }
  })

  app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
      res.redirect('/');
    }); 
  })
}

if(needLogin){
  app.use((req, res, next) => {
    if("username" in req.session){
      next();
    }else{     
      res.redirect('/login');
    }
  })
}

// ###################################################################################
// ---------------------------------  Main section ----------------------------------
// ###################################################################################

// file cache
if(process.env.expireTime > 0){
  app.all((req, res, next) => {
    res.header('Expires', new Date(Date.now() + process.env.general.expireTime).toUTCString());
    res.header("Cache-Control", "public, max-age="+process.env.general.expireTime.toString());
    next()
  })
}


const formatDate = (dt) => {
  try{
    var y = dt.getFullYear();
    var m = ('00' + (dt.getMonth()+1)).slice(-2);
    var d = ('00' + dt.getDate()).slice(-2);
    return (y + '-' + m + '-' + d);
  }catch{
    logger.a_error("Unknown datetime --> 0000-00-00")
    return "0000-00-00"
  }
}

const getMineType = (fname) => {
  const extention = fname.split(".").pop().toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.jpeg': 'image/jpg',
    '.gif': 'image/gif',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.svg': 'application/image/svg+xml'
  };
  return mimeTypes[extention] || ""
}

const getFileType = (fname) => {
  const extention = fname.split(".").pop().toLowerCase();
  const filetypes = {
    "text" : ["txt", "md", "ini", "license"],
    "pdf" : ["pdf"],
    "office" : ["docs", "excel", "pptx"],
    "code" : ["cpp", "hpp", "cxx", "hxx", "c", "h", 
              "html", "css", "js", "json",  "ts", "ejs",
              "Dockerfile", "yml", "yaml", "cnf", "conf", "toml", "xml", "env",
              "py", "rb", "go", "cu", "Makefile",
              "gitkeep", "gitignore", "sh", "cfg"
            ],
    "image" : ["jpg", "gif", "png", "jpeg", "ico"],
    "movie": ["mov", "mp4"],
    "audio": ["wav", "mp3", "ogg"],
    "app": ["apk", "exe", "deb", "appimage"],
    "os": ["iso"],

    // spftwares
    "blender": ["blend", "blend1"],
    "adobe": ["aep","ps"],
  }
  for(let i in filetypes){
    if(filetypes[i].indexOf(extention) >= 0){return i}
  }
  return "";
}

const ftype2icon = (ftype) => {
  const f2i = {
    "dir":"fas fa-folder-open",
    "link":"fas fa-external-link-alt",

    "text":"fas fa-file-alt",
    "pdf":"fas fa-file-pdf",
    "office":"fas fa-print",
    "code":"fas fa-file-code",
    "image":"fas fa-file-image",
    "movie":"fas fa-file-video",
    "audio":"fas fa-file-audio",
    "font":"fas fa-font",
    "audio":"fas fa-font",
    "os":"fab fa-ubuntu",
    "app":"fas fa-gamepad",
    "":"fas fa-file"
  }
  return f2i[ftype] || "fas fa-file"
}

const filesize_format = (size) => {
  var i = Math.floor( Math.log(size) / Math.log(1024) );
  return ( size / Math.pow(1024, i) ).toFixed(2) + ' ' + ['B', 'kB', 'MB', 'GB', 'TB'][i];
}

const view = async(req, res, is_trash) => {
  const location = decodeURIComponent(req.query["dir"]|| "/").replace(/[\/]{2,}/gm, "/").replace(/(.^\/+)[\/]{1,}$/gm, "(.+)")
  const fname = (is_trash ? process.env.TRASH_DIR : process.env.DIR) + location;
  const src_dir = is_trash ? "/src-trash" : "/src";
  const parent_dir = location==="/" ? "/" : path.dirname(location);

  DEBUG(`VISITED : ${fname}    ${location}`);
  const render_title_html = (_title) => {
    let title_html = `<a href="${is_trash ? '/trash':'/'}"><i class="fas ${is_trash ? 'fa-trash' : 'fa-home'}"></i></a>`;
    let t_s = _title.split("/")
    let t_d = `${is_trash ? '/trash':'/view'}?dir=`
    t_s.forEach(tt => {
      title_html += `<a href=\"${t_d + tt}\">${tt}</a>/`;
      t_d += (tt + "/");
    });
    title_html = title_html.slice(0,-1);
    return title_html;
  }

  const location_html = render_title_html(location)

  const stat = await fs.stat(fname).catch(e => {return false;});
  if(stat === false){
    res.render("view.ejs", {
      type : "notfound",
      result : [],
      location, location_html, src_dir,
      parent_dir,
      login : "username" in req.session,
      need_login : needLogin,
      need_login_to_edit : needLoginToEdit,
      view_type : req.params["type"] || "list",
    })
    WARN("file not found");
  }else if(stat.isDirectory()){
    const names = await fs.readdir(fname).catch(err => {return false})
    result = []
    for(i in names){
      const stat2 = await fs.stat(`${fname}/${names[i]}`).catch(e => {return false;});

      let filetype = getFileType(names[i]);
      if(filetype === ""){
        const stat = await fs.stat(`${fname}/${names[i]}`).catch(e => {return false;});
        if(stat.isDirectory()){filetype = "dir"}
        else if(stat.isSymbolicLink()){filetype = "link"}
      }

      if(stat2 === false){continue;}
      let type = stat2.isFile() ? "file" : (stat2.isSymbolicLink() ? "link" : (stat2.isDirectory() ? "dir" : "unknown"))

      result.push({
        name : names[i],
        location : `${location}/${names[i]}`,
        size : filesize_format(stat2.size),
        icon : ftype2icon(filetype),
        ctime : formatDate(stat2.ctime),
        mtime : formatDate(stat2.mtime),
        parent_dir,
        extention : names[i].split(".").pop(),
        login : "username" in req.session,
        need_login : needLogin,
        need_login_to_edit : needLoginToEdit,
        type : type
      })
    }
    console.log(req.params)
    res.render("view.ejs", {
      type : "dir",
      result : result,
      parent_dir,
      location, location_html, src_dir,
      login : "username" in req.session,
      need_login : needLogin,
      need_login_to_edit : needLoginToEdit,
      view_type : req.params["type"] || "list",
    })
  }else if(stat.isSymbolicLink()){
    res.render("view.ejs", {
      type : "symbolicLink",
      location : location,
      location_html : location_html,
      parent_dir,
      login : "username" in req.session,
      need_login : needLogin,
      need_login_to_edit : needLoginToEdit,
    })
  }else{
    const filetype = getFileType(location);
    const minetype = getMineType(location);
    const isBinary = !(filetype === "text" || filetype === "code")
    const context = isBinary ? "" : await fs.readFile(fname)

    res.render("view.ejs", {
      type : "file",
      size : stat.size,
      ctime : formatDate(stat.ctime),
      mtime : formatDate(stat.mtime),
      name : path.basename(location),
      dir : path.dirname(location),
      parent_dir,
      location, location_html, src_dir,
      filetype : filetype,
      minetype : minetype,
      context : context,
      isbinary : isBinary,
      login : "username" in req.session,
      need_login : needLogin,
      need_login_to_edit : needLoginToEdit,
    })
  }
}


app.get("/view", (req, res) => {view(req,res,false)})
app.get("/trash", (req, res) => {view(req,res,true)})

app.use('/src', express.static(process.env.DIR));
app.use('/src-trash', express.static(process.env.TRASH_DIR));
app.use('/static', express.static("static"));


app.use("/api", require("./api.js"))
app.use((req, res, next) => {
  res.status(404).send("<h1>Page Not Found!</h1>")
});

console.log("Mode : ", process.env.NODE_ENV)

if(process.env.BACKUP === "true"){
  DEBUG(`BACKUP SCHEDULE ---> ${process.env.BACKUP_TIME}`)
  const schedule = require('node-schedule');
  const fs_extra = require("fs-extra");
  schedule.scheduleJob('0 1 * * *', (fireDate) => {
    INFO(`Backup doing ..... --> scheduled = ${fireDate}, destination = ${process.env.BACKUP_DIR}`)
    fs_extra.copy(process.env.DIR, process.env.BACKUP_DIR, (err) => {
      if (err) { ERROR(`BACKUP ERROR ${err}`); return;}
      INFO("Backup Finished")
    });
  });
}

app.listen(process.env.PORT);