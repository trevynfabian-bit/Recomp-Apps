import re, subprocess, sys
out=subprocess.run(['node','.unused.cjs']+sys.argv[1:],capture_output=True,text=True).stdout
skip={'mockProfile'}
for line in out.strip().splitlines():
    f,names=line.split(': '); names=[n.strip() for n in names.split(',') if n.strip() not in skip]
    s=open(f).read()
    for n in names:
        def fix(m):
            items=[x.strip() for x in m.group(2).split(',') if x.strip() and x.strip()!=n]
            return (m.group(1)+'{ '+', '.join(items)+' }'+m.group(3)) if items else ''
        s=re.sub(r"(import )\{([^}]*)\}( from '[^']+';\n?)", lambda m: fix(m) if re.search(r'\b'+n+r'\b', m.group(2)) else m.group(0), s)
    open(f,'w').write(s); print('bersih',f,names)
