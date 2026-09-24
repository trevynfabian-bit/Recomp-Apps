const ts=require('typescript'),fs=require('fs');
for (const f of process.argv.slice(2)) {
  const src=fs.readFileSync(f,'utf8'); const sf=ts.createSourceFile(f,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  sf.statements.forEach(st=>{
    if (!(ts.isFunctionDeclaration(st) && st.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword))) return;
    (function v(n){
      if (ts.isReturnStatement(n) && n.expression) {
        const t=n.expression.getText(sf);
        if (/</.test(t)) {
          const jalan=/HeaderLayar|KeadaanGagal[^>]*aksi|Kembali|Keluar|Tutup|useKembali|kembaliSatuLangkah|LayarMuatTarget|<Tabs|TombolBertepi|onPress/.test(t);
          console.log(f, sf.getLineAndCharacterOfPosition(n.getStart()).line+1, jalan?'ada jalan':'BUNTU', t.replace(/\s+/g,' ').slice(0,90));
        }
      }
      if (ts.isFunctionLike(n) && n!==st) return;
      ts.forEachChild(n,v);
    })(st);
  });
}
