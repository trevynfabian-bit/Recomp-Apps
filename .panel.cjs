// Ubah <View style={{ ...panel... }}> menjadi <Panel ...> berdasarkan AST.
const ts=require('typescript'),fs=require('fs');
const BUANG=[/^padding: spacing\.md$/,/^borderRadius: radius\.md$/,/^backgroundColor: colors\.permukaanCekung$/,/^borderWidth: 1$/,/^borderColor: tint\(colors\.[\w.]+, 'tepi'\)$/,/^gap: spacing\.sm$/];
const NADA={'colors.aksen.isian':'aksen','colors.status.bahaya.isian':'bahaya','colors.status.sukses.isian':'sukses','colors.status.peringatan.isian':'peringatan'};
for (const f of process.argv.slice(2)) {
  let src=fs.readFileSync(f,'utf8');
  const sf=ts.createSourceFile(f,src,ts.ScriptTarget.Latest,true);
  const edit=[];
  (function v(n){
    if (ts.isJsxElement(n) && n.openingElement.tagName.getText()==='View') {
      const attrs=n.openingElement.attributes.properties;
      const st=attrs.find(a=>ts.isJsxAttribute(a)&&a.name.getText()==='style');
      if (st && attrs.length===1 && st.initializer && ts.isJsxExpression(st.initializer) && st.initializer.expression && ts.isObjectLiteralExpression(st.initializer.expression)) {
        const props=st.initializer.expression.properties.map(p=>p.getText(sf).replace(/\s+/g,' ').trim());
        const has=(re)=>props.some(p=>re.test(p));
        const cekung=has(/^backgroundColor: colors\.permukaanCekung$/), tepi=props.find(p=>/^borderColor: tint\(/.test(p));
        const panel=has(/^padding: spacing\.md$/)&&has(/^borderRadius: radius\.md$/)&&(cekung||tepi)&&!has(/TextInput|flexDirection: 'row'/)&&!has(/^paddingHorizontal/);
        if (panel) {
          let nada=null; const murni=tepi && /^borderColor: tint\((colors\.[\w.]+), 'tepi'\)$/.exec(tepi);
          if (murni) { nada=NADA[murni[1]]; if(!nada) return; }
          // Tepi bersyarat: biarkan borderColor & borderWidth di style.
          const sisa=props.filter(p=>!BUANG.some(re=>re.test(p)) || (!murni && /^border(Width|Color)/.test(p)));
          const open='<Panel'+(nada?` nada="${nada}"`:'')+(sisa.length?` style={{ ${sisa.join(', ')} }}`:'')+'>';
          edit.push([n.openingElement.getStart(sf), n.openingElement.getEnd(), open]);
          edit.push([n.closingElement.getStart(sf), n.closingElement.getEnd(), '</Panel>']);
          console.log(f, sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1, open.slice(0,110));
        }
      }
    }
    ts.forEachChild(n,v);
  })(sf);
  edit.sort((a,b)=>b[0]-a[0]).forEach(([a,b,t])=>{ src=src.slice(0,a)+t+src.slice(b); });
  if (edit.length) fs.writeFileSync(f,src);
}
