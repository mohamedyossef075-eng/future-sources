
const vm=require('node:vm'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/import\(/g,'importModule(');
const data=JSON.parse(fs.readFileSync(path.join(root,'catalog-products.json'),'utf8'));
class El{
 constructor(){this.children=[];this.value='';this.textContent='';this.style={};this.classList={add(){},remove(){}}}
 replaceChildren(){this.children=[];this.textContent=''}append(...items){this.children.push(...items)}
}
const tick=()=>new Promise(r=>setImmediate(r));
async function setup({sdkFail=false,jsonFail=false}={}){
 const els={};let onSuccess,onError,url='';
 const context={AbortController,setTimeout,clearTimeout,console:{warn(){}},
 document:{getElementById:id=>els[id]??=new El(),createElement:()=>new El(),createTextNode:s=>s},
 window:{open:u=>{url=u}},alert:()=>{},
 fetch:async()=>{if(jsonFail)throw Error('404');return {ok:true,json:async()=>data}},
 importModule:async name=>{if(sdkFail)throw Error('SDK blocked');return name.includes('firebase-app')?{initializeApp:()=>({})}:{getFirestore:()=>({}),collection:()=>({}),query:()=>({}),where:()=>({}),onSnapshot:(q,s,e)=>{onSuccess=s;onError=e}}}
 };
 vm.createContext(context);vm.runInContext(source,context);await tick();
 return {els,run:s=>vm.runInContext(s,context),success:rows=>onSuccess({docs:rows.map(({id,...p})=>({id,data:()=>p}))}),error:()=>onError(Error('permission-denied')),message:()=>new URL(url).searchParams.get('text')};
}
(async()=>{
 let t=await setup({sdkFail:true});
 assert.equal(t.run('products.length'),33);
 t.run('addProduct("static:catalog-001");addProduct("static:catalog-001");openCart();send(false)');
 let m=t.message();assert(m.includes(data[0].name+' × 2 كرتون'));assert(m.includes('١٨٥'));assert(m.includes('٣٧٠'));assert.equal(t.run('cartTotal()'),370);
 console.log('PASS SDK unavailable: 33 fallback products, name/quantity/unit/unit price/total survive URL encoding');
 t=await setup();t.error();assert.equal(t.run('products.length'),33);assert(t.els.loading.textContent.includes('نسخة احتياطية'));
 t.run('addProduct("static:catalog-001");addProduct("static:catalog-001")');
 t.success([{id:'remote-1',active:true,name:'اسم جديد',unit:'عبوة',price:999}]);
 assert.equal(t.run('cart.size'),1);assert.equal(t.run('cartTotal()'),370);
 t.run('send(false)');assert(t.message().includes(data[0].name+' × 2 كرتون'));assert(t.message().includes('٣٧٠'));
 console.log('PASS Firestore failure and source switch: existing basket and visible total remain consistent');
 t.run('cart.clear();addProduct("firestore:remote-1");change("firestore:remote-1",1);send(false)');
 assert(t.message().includes('اسم جديد × 2 عبوة'));assert(t.message().includes('٩٩٩'));assert.equal(t.run('cartTotal()'),1998);
 t.run('send(true)');assert(t.message().includes('طلب عرض سعر'));assert(t.message().includes('١٬٩٩٨'));
 t.run('change("firestore:remote-1",-1);change("firestore:remote-1",-1)');assert.equal(t.run('cart.size'),0);
 console.log('PASS Firestore order, quote, decrement and removal');
 t.success([{id:'bad',active:true,title:'اسم',salePrice:185,sellingUnit:'كرتون'}]);assert.equal(t.run('products.length'),33);
 t.run('globalThis.clean=normalizeProducts([{id:"1",active:true,name:" منتج ",unit:" كيلو ",price:"12.50"},{id:"2",active:true,name:"ب",unit:"كرتون",price:null},{id:"3",active:true,name:"ج",unit:"كرتون",price:-5},{id:"4",active:true,name:"د",unit:"كرتون",price:"NaN"},{id:"5",active:false,name:"ه",unit:"كرتون",price:10},{id:"1",active:true,name:"مكرر",unit:"كرتون",price:12}],"test")');
 assert.equal(t.run('clean.length'),1);assert.equal(t.run('clean[0].price'),12.5);assert.equal(t.run('clean[0].name'),'منتج');
 console.log('PASS field validation: missing, null, negative, duplicate and inactive rows excluded; numeric strings normalized');
 t=await setup({sdkFail:true,jsonFail:true});assert.equal(t.run('products.length'),0);assert(t.els.loading.textContent.includes('تعذر عرض'));
 console.log('PASS both sources unavailable: actionable empty-state message');
})().catch(e=>{console.error(e);process.exitCode=1});
