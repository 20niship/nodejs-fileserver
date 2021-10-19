# Node.js file server
- node js File server without database 


1. install packages
```
$ npm i
```

2. add `.env` file to this directory
```
PORT=8080
# NODE_ENV=production

ExpireTime=0

# ServeするDirectory設定
DIR=../data
TRASH_DIR=../trash

# needLogin : 閲覧、編集両方にLoginが必要
# needLoginToEdit : 編集のみLoginが必要
needLogin=false
needLoginToEdit=true

# Login時の認証情報
user_name=username
user_password=password

# backup関連
BACKUP=true
BACKUP_TIME="0 1 * * *"
BACKUP_DIR=../backup

# アップロード関連
UPLAD_TEMP_DIR="./tmp"
UPLOAD_FILE_MAX_SIZE=10
UPLOAD_MAX_CHUNK_SIZE=5000
```

2. run
```
$ node index.js
```


