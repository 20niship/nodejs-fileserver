require('dotenv').config();
import express from 'express'
import fs_nopromise from 'fs';
import fs_extra from 'fs-extra';
import path from 'path';
const zipdir = require("zip-dir");
const uploader = require('huge-uploader-nodejs');

const router = express.Router();
const fs = require("fs").promises;

const INFO = (str: string) => { console.log(`\x1b[00m[  INFO   ] ${(new Date()).toISOString()}"\t"${str}\x1b[0m`) }
const DEBUG = (str: string) => { console.log(`\x1b[32m[  DEBUG  ] ${(new Date()).toISOString()}"\t"${str}\x1b[0m`) }
const WARN = (str: string) => { console.log(`\x1b[33m[ WARNING ] ${(new Date()).toISOString()}"\t"${str}\x1b[0m`) }
const ERROR = (str: string) => { console.log(`\x1b[31m[  ERROR  ] ${(new Date()).toISOString()}"\t"${str}\x1b[0m`) }

router.use(express.urlencoded({ extended: true }))
router.use(express.json());
router.get("/", (_, res) => { res.redirect("/"); })

router.post("/download", async (req, res) => {
  let params = req.body;
  console.log(params)
  if (!("location" in params && params.location !== 'undefined')) {
    res.status(500).send("No location parameter");
    return;
  }
  const fname = process.env.DIR + params.location.replace(/[\/]{2,}/gm, "/").replace(/(.^\/+)[\/]{1,}$/gm, "(.+)")
  var extname = String(path.extname(params.location)).toLowerCase();
  var mimeTypes:{[key:string]:string}= {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.svg': 'application/image/svg+xml'
  };
  const contentType = mimeTypes[extname] || 'application/octet-stream';
  console.log(fname)

  const stat = await fs.stat(fname).catch((_ : any) => { return false; });
  if (stat === false) {
    res.status(404).send("File not found!")
    ERROR(`Download file not found! --> ${fname}`)
  } else if (stat.isDirectory()) {
    zipdir(fname, function(err:any, buffer:any) {
      if (err) { res.status(500).send("Internal Server Error while Creating Zip file") }
      else {
        res.end(buffer, "utf-8")
      }
    });
  } else if (stat.isFile()) {
    try {
      res.writeHead(200, { "Content-Length": stat.size, "Content-Type": contentType });
      let stream = fs_nopromise.createReadStream(fname);
      stream.on('data', chunk => { if (!res.write(chunk)) { stream.pause(); } });
      stream.on('end', () => { res.end(); });
      res.on("drain", () => { stream.resume(); });
    } catch (err) {
      if (!res.headersSent) { res.status(404).send("File/Directory not found!") }
      ERROR(`download error --> ${err}`)
    }
  } else if (stat.isSymbolicLink()) {
    res.status(404).send(location + " is a symbolic link. This is not supported")
  }
})



// ####################################################################################
//                             これ以降は編集権限が必要なAPI
// ####################################################################################

const needLogin = (process.env.needLogin === "true")
const needLoginToEdit = (process.env.needLoginToEdit === "true")
if (needLoginToEdit && !needLogin) {
  router.use((req, res, next) => {
    if ("username" in req.session) {
      next();
    } else {
      res.redirect('/login');
    }
  })
}



// ---------------------  file upload ---------------------------------
const UPLOAD_FILE_MAX_SIZE = parseInt(process?.env?.UPLOAD_FILE_MAX_SIZE || "0")
const UPLOAD_MAX_CHUNK_SIZE = parseInt(process?.env?.UPLOAD_MAX_CHUNK_SIZE || "0")

router.post("/upload", (req, res) => {
  console.log("UPLAD START!!")
  uploader(req, process.env.UPLAD_TEMP_DIR, UPLOAD_FILE_MAX_SIZE, UPLOAD_MAX_CHUNK_SIZE)
    .then((assembleChunks : any) => {
      // chunk written to disk
      res.writeHead(204, 'No Content');
      res.end();
      // on last chunk, assembleChunks function is returned
      // the response is already sent to the browser because it can take some time if the file is huge
      if (assembleChunks) {
        // so you call the promise, it assembles all the pieces together and cleans the temporary files
        assembleChunks()
          // when it's done, it returns an object with the path to the file and additional post parameters if any
          .then(async (data :any) => {
            console.log(data)
            console.log("FINISH")
            await fs.rename(data.filePath, process.env.DIR + (data?.postParams?.new_name || "unknown"))

          }) // { filePath: 'tmp/1528932277257', postParams: { email: 'upload@corp.com', name: 'Mr Smith' } }
          // errors if any are triggered by the file system (disk is full…)
          .catch((err: any) => console.log(err));
      }
    })
    .catch((err: any) => {
      console.log(err.message)
      if (err.message === 'Missing header(s)') {
        res.writeHead(400, 'Bad Request', { 'Content-Type': 'text/plain' });
        res.end('Missing uploader-* header');
        return;
      }

      if (err.message === 'Missing Content-Type') {
        res.writeHead(400, 'Bad Request', { 'Content-Type': 'text/plain' });
        res.end('Missing Content-Type');
        return;
      }

      if (err.message.includes('Unsupported content type')) {
        res.writeHead(400, 'Bad Request', { 'Content-Type': 'text/plain' });
        res.end('Unsupported content type');
        return;
      }

      if (err.message === 'Chunk is out of range') {
        res.writeHead(400, 'Bad Request', { 'Content-Type': 'text/plain' });
        res.end('Chunk number must be between 0 and total chunks - 1 (0 indexed)');
        return;
      }

      if (err.message === 'File is above size limit') {
        res.writeHead(413, 'Payload Too Large', { 'Content-Type': 'text/plain' });
        res.end(`File is too large. Max fileSize is: ${UPLOAD_FILE_MAX_SIZE}MB`);
        return;
      }

      if (err.message === 'Chunk is above size limit') {
        res.writeHead(413, 'Payload Too Large', { 'Content-Type': 'text/plain' });
        res.end(`Chunk is too large. Max chunkSize is: ${UPLOAD_MAX_CHUNK_SIZE}MB`);
        return;
      }

      // this error is triggered if a chunk with uploader-chunk-number header != 0
      // is sent and there is no corresponding temp dir.
      // It means that the upload dir has been deleted in the meantime.
      // Although uploads should be resumable, you can't keep partial uploads for days on your server
      if (err && err.message === 'Upload has expired') {
        res.writeHead(410, 'Gone', { 'Content-Type': 'text/plain' });
        res.end(err.message);
        return;
      }

      // other FS errors
      res.writeHead(500, 'Internal Server Error'); // potentially saturated disk
      res.end();
    });
})



router.post("/mkdir", async (req, res) => {
  const flocation= req.body?.location;
  if (flocation === "") {
    res.status(500).send("No location parameter");
    return;
  }
  fs_extra.mkdirs(process.env.DIR + req.body.location, function(err: any) {
    if (err) { res.status(500).send(err); ERROR(err); return; }
    res.send("OK")
  });
})

router.post("/copy", async (req, res) => {
  if (!("from" in req.body && "to" in req.body)) {
    res.status(500).send("No location parameter");
    return;
  }
  const name = path.basename(req.body.from);
  console.log(name)
  fs_extra.copy(process.env.DIR + req.body.from, process.env.DIR + req.body.to + "/" + name, (err: any) => {
    if (err) { res.status(500).send(err); ERROR(err); return; }
    res.send("OK")
  });
})

router.post("/move", async (req, res) => {
  const name = path.basename(req.body.from);
  if (!("from" in req.body && "to" in req.body)) {
    res.status(500).send("No location parameter");
    return;
  }

  const from = path.format({ base: process.env.DIR + req.body.from });
  const to = path.format({ base: process.env.DIR + req.body.to + "/" + name });
  console.log(from);
  console.log(to);
  if (from === to) {
    res.status(500).json({ err: "same dir" });
    return;
  }

  try {
    await fs_extra.move(from, to, { overwrite: true })
    res.send("OK")
  } catch (err: any) {
    res.status(500).send(err); ERROR(err);
  }
})


router.post("/exists", async (req, res) => {
  const location = (req.body["location"] || "/").replace(/[\/]{2,}/gm, "/").replace(/(.^\/+)[\/]{1,}$/gm, "(.+)")
  const fname = process.env.DIR + location;
  const stat = await fs.stat(fname).catch(() => { return false; });
  if (stat === false) {
    res.status(404).send({ type: "not_found", exist: false })
    WARN("file not found");
    return;
  }
  if (stat.isFile()) { res.json({ type: "file", exist: true }) }
  else if (stat.isSymbolicLink()) { res.json({ type: "symbolic_link", exist: true }) }
  else if (!stat.isDirectory()) { res.json({ type: "dir", exist: true }); }
  else {
    res.json({ type: "unknown", exist: true });
    WARN(`unknown content => ${fname}`)
  }
})


router.post("/list", async (req, res) => {
  const location = (req.body["location"] || "/").replace(/[\/]{2,}/gm, "/").replace(/(.^\/+)[\/]{1,}$/gm, "(.+)")
  const fname = process.env.DIR + location;

  console.log(fname, location)
  const stat = await fs.stat(fname).catch(() => { return false; });
  if (stat === false) {
    res.status(404).send({ type: "not_found", child: [] })
    WARN("file not found");
    return;
  }

  if (stat.isFile()) {
    res.json({ type: "file", child: [] })
    return;
  }

  if (stat.isSymbolicLink()) {
    res.json({ type: "symbolic_link", child: [] })
    return;
  }

  if (!stat.isDirectory()) {
    res.status(500).send("Unknown Content");
    return;
  }

  const names = await fs.readdir(fname).catch((_ : any)=> { return false })
  let result = []
  for (let i in names) {
    const stat2 = await fs.stat(`${fname}/${names[i]}`).catch((_ : any) => { return false; });
    if (stat2 === false) { continue; }
    let type = stat2.isFile() ? "file" : (stat2.isSymbolicLink() ? "link" : (stat2.isDirectory() ? "dir" : "unknown"))

    result.push({
      name: names[i],
      location: (`${location}/${names[i]}`).replace(/[\/]{2,}/gm, "/").replace(/(.^\/+)[\/]{1,}$/gm, "(.+)"),
      size: stat2.size,
      ctime: stat2.ctime,
      mtime: stat2.mtime,
      type: type
    })
  }
  res.json({ type: "dir", child: result })
})


router.post("/remove", async (req, res) => {
  const flocation= req.body?.location;
  if (flocation === undefined) { res.status(500).send("No location parameter"); return; }
  try {
    await fs_extra.move(process.env.DIR + flocation, `${process.env.TRASH_DIR}/${(new Date()).toISOString()}-${path.basename(req.body.location)}`)
    res.send("OK")
  } catch (err :any) {
    res.status(500).send(err); ERROR(err);
  }
})


router.post("/remove-trash", async (req, res) => {
  const flocation= req.body?.location;
  if (flocation === undefined) { res.status(500).send("No location parameter"); return; }
  try {
    const file = path.join(process.env?.TRASH_DIR || "", req.body.location);
    await fs_extra.remove(file);
    res.send("OK")
  } catch (err : any) {
    res.status(500).send(err); ERROR(err);
  }
})

router.post("/remove-all-trash", async (_, res) => {
  console.log(process.env.TRASH_DIR)
  const files = await fs.readdir(process.env.TRASH_DIR)
  for (const file of files) {
    try {
      console.log(file, path.join(process.env?.TRASH_DIR || "", file))
      await fs_extra.remove(path.join(process.env?.TRASH_DIR || "", file))
    } catch (err : any) {
      res.status(500).send(err); ERROR(err);
    }
  }
  res.send("OK");
})

module.exports = router;

