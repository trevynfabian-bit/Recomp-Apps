import re, sys, subprocess
out=subprocess.run(['node','.unused.cjs']+sys.argv[1:],capture_output=True,text=True).stdout
for line in sorted(set(out.strip().splitlines())):
    f,names=line.split(': '); names=[n.strip() for n in names.split(',')]
    s=open(f).read()
    for n in names:
        # hapus dari daftar import bernama
        def fix(m):
            items=[x.strip() for x in m.group(2).split(',') if x.strip() and x.strip()!=n and x.strip()!='type '+n]
            if not items: return ''
            return m.group(1)+'{ '+', '.join(items)+' }'+m.group(3)
        s=re.sub(r"(import )\{([^}]*)\}( from '[^']+';\n?)", lambda m: fix(m) if re.search(r'\b'+n+r'\b', m.group(2)) else m.group(0), s)
        s=re.sub(r"^import "+n+r" from '[^']+';\n", '', s, flags=re.M)
    open(f,'w').write(s); print('dibersihkan', f, names)
