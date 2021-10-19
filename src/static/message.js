

const MyMessage = (params) => {
  const isConfirm = params.type === "confirm" || (params.yesbtn && params.nobtn)
  const isSimple = params.type === "simple"  || !params.title;
  const duration = params.duration || -1;

  const title = params.title || "Hello";
  const msg = params.msg || "This is msg";
  const yesbtn = params.yesbtn || "OK";
  const nobtn = params.nobtn || "Cancel";
  return new Promise((resolve, reject) => {
      let confirm_el = document.createElement("div")
      if(isConfirm){ confirm_el.setAttribute("class", 'my-dialog-ovelay'); }
      if(isSimple){
          confirm_el.innerHTML = 
            `<div class='my-dialog-simple my-dialog-fadeout'>
              <span class="my-dialog-msg">${msg}</span><i class='fas fa-times' id="my-dialog-close-btn"></i>
            </div>`;
      }else{
          confirm_el.innerHTML = 
            `<div class='my-dialog-confirm my-dialog-fadeout'>
              <span class="my-dialog-title">${title}</span><i class='fas fa-times' id="my-dialog-close-btn"></i>
            <div class='my-dialog-msg'><p>${msg}</p></div>
            <div class='my-dialog-buttons'>
              <button id="my-confirm-yes-btn">${yesbtn}</button>
              <button id="my-confirm-no-btn">${nobtn}</button> 
            </div></div>`;
      }
      const remove = () =>{
        if(isConfirm){
          confirm_el.remove();
        }else{
          confirm_el.classList.add("my-dialog-fadeout-remove")
          setTimeout(() => {confirm_el.remove()},  300);
        }
      }
      const body = document.getElementsByTagName("body")[0];
      // body.prepend(confirm_el);
      body.insertBefore(confirm_el, null);
      if(!isSimple){
        document.getElementById("my-confirm-yes-btn").onclick = () => {
          resolve("ok")
          remove()
        };
        document.getElementById("my-confirm-no-btn").onclick = () => {
          resolve("cancel")
          remove()
        };
      }
      document.getElementById("my-dialog-close-btn").onclick = () => {
        resolve("close")
        remove()
      }

      if(duration > 0){
        setTimeout(() => {resolve("timeout"); remove();}, duration);
      }
  })
}
