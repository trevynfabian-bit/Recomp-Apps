// Melaporkan import bernama yang tidak dipakai di berkas (cek sederhana berbasis AST).
const ts=require('typescript'),fs=require('fs');
for (const f of process.argv.slice(2)) {
  const src=fs.readFileSync(f,'utf8'); const sf=ts.createSourceFile(f,src,ts.ScriptTarget.Latest,true);
  const names=[]; const used=new Set();
  sf.statements.forEach(st=>{ if(ts.isImportDeclaration(st)&&st.importClause){ const nb=st.importClause.namedBindings; if(nb&&ts.isNamedImports(nb)) nb.elements.forEach(e=>names.push(e.name.text)); if(st.importClause.name) names.push(st.importClause.name.text);} });
  (function v(n){ if(ts.isIdentifier(n)&&!(n.parent&&(ts.isImportSpecifier(n.parent)||ts.isImportClause(n.parent)))) used.add(n.text); ts.forEachChild(n,v); })(sf);
  const tak=names.filter(x=>!used.has(x)); if(tak.length) console.log(f+': '+tak.join(', '));
}
