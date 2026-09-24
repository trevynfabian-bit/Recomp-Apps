const ts=require('typescript'),fs=require('fs');
const mode=process.argv[2]; const files=process.argv.slice(3);
for (const f of files){
  let src=fs.readFileSync(f,'utf8'); const sf=ts.createSourceFile(f,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const edits=[];
  (function v(n){
    if (ts.isJsxElement(n) && n.openingElement.tagName.getText(sf)==='View') {
      const anak=n.children.filter(c=>!(ts.isJsxText(c)&&c.getText(sf).trim()==='')&&!ts.isJsxExpression(c)||(ts.isJsxExpression(c)&&c.expression));
      const el=anak.filter(c=>ts.isJsxElement(c)||ts.isJsxSelfClosingElement(c));
      const tag=(c)=>ts.isJsxElement(c)?c.openingElement.tagName.getText(sf):c.tagName.getText(sf);
      if (el.length>=2 && tag(el[0])==='TombolIkon' && /aksesLabel="Kembali"/.test(el[0].getText(sf))) {
        const onPress=/onPress=\{(.*)\}\s*\/>$/s.exec(el[0].getText(sf))[1];
        const kolom=el[1]; const teks=(ts.isJsxElement(kolom)?kolom.children:[]).filter(c=>ts.isJsxElement(c));
        const isi=teks.map(t=>t.children.map(c=>c.getText(sf)).join('').trim());
        const lain=el.slice(2).map(c=>c.getText(sf));
        console.log(f, JSON.stringify({onPress, isi, jumlahTeks: teks.length, tagKolom: tag(kolom), lain: lain.map(x=>x.slice(0,60))}));
        if (mode==='tulis' && teks.length>=1 && teks.length<=2 && tag(kolom)==='View' && lain.length===0 && teks.every(t=>t.openingElement.tagName.getText(sf)==='Text')) {
          const j=(x)=>/^\{.*\}$/s.test(x)||/[{}]/.test(x)?(/^\{.*\}$/s.test(x)?x:'{`'+x.replace(/\{/g,'${')+'`}'):JSON.stringify(x);
          const kembali = onPress.trim()==='() => router.back()' ? 'kembali' : `kembali={${onPress.trim()}}`;
          const ind=src.slice(src.lastIndexOf('\n',n.getStart(sf))+1,n.getStart(sf));
          let out=`<HeaderLayar\n${ind}  ${kembali}\n${ind}  judul=${j(isi[0].replace(/\s+/g,' '))}`;
          if (isi[1]) out+=`\n${ind}  subjudul=${j(isi[1].replace(/\s+/g,' '))}`;
          out+=`\n${ind}/>`;
          edits.push([n.getStart(sf), n.getEnd(), out]);
        }
        return;
      }
    }
    ts.forEachChild(n,v);
  })(sf);
  if (mode==='tulis' && edits.length){ edits.sort((a,b)=>b[0]-a[0]).forEach(([a,b,t])=>{src=src.slice(0,a)+t+src.slice(b);}); fs.writeFileSync(f,src); console.log('  ditulis', edits.length); }
}
