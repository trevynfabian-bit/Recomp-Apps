import re, glob, sys
pat=re.compile(r"""(?P<ind>[ \t]*)<Pressable\n(?P<props>(?:(?!</Pressable>|<Pressable).)*?)>\n\s*<Text style=\{\{ \.\.\.typography\.(?P<typ>\w+), color: (?P<col>[^}]+?) \}\}>(?P<lbl>[^<{]*)</Text>\n\s*</Pressable>""", re.S)
def ambil(props, nama):
    i=props.find(nama+'={')
    if i<0: return None
    j=i+len(nama)+1; d=0
    for k in range(j,len(props)):
        if props[k]=='{': d+=1
        elif props[k]=='}':
            d-=1
            if d==0: return props[j+1:k]
    return None
def attr_str(props, nama):
    m=re.search(nama+r'="([^"]*)"', props); return m.group(1) if m else None
NADA={'colors.aksen.teks':None,'colors.status.bahaya.teks':'bahaya','colors.teksSamar':'netral','colors.teksRedup':'netral'}
def ensure(s, f):
    comp = f.startswith('src/components/')
    src = "'./Tombol'" if comp else "'@/components'"
    m=re.search(r"import \{([^}]*)\} from "+re.escape(src)+";", s)
    if m:
        have=[x.strip() for x in m.group(1).split(',') if x.strip()]
        if 'Tombol' not in have: have.append('Tombol')
        have=sorted(set(have), key=lambda x:x.lower()); body=", ".join(have)
        rep="import { "+body+" } from "+src+";" if len(body)<90 else "import {\n  "+",\n  ".join(have)+",\n} from "+src+";"
        return s[:m.start()]+rep+s[m.end():]
    idx=[m.end() for m in re.finditer(r"^import [^\n]*;\n", s, re.M)][-1]
    return s[:idx]+"import { Tombol } from "+src+";\n"+s[idx:]
tot=0
for f in sorted(glob.glob('app/**/*.tsx', recursive=True)+glob.glob('src/components/*.tsx')):
    s=open(f).read(); n=0
    def rep(m):
        global n
        col=m.group('col').strip()
        if m.group('typ') not in ('label',) or col not in NADA: return m.group(0)
        props=m.group('props'); i=m.group('ind')
        onp=ambil(props,'onPress')
        if onp is None: return m.group(0)
        # buang ketukRingan(); Tombol sudah melakukannya
        onp2=re.sub(r"\n\s*ketukRingan\(\);", "", onp)
        body=onp2.strip()
        mm=re.fullmatch(r"\(\) => \{\s*([^;{}]+);\s*\}", body, re.S)
        if mm: body="() => "+mm.group(1).strip()
        lbl=m.group('lbl').strip()
        out=[f'{i}<Tombol', f'{i}  varian="teks"']
        if NADA[col]: out.append(f'{i}  nada="{NADA[col]}"')
        out.append(f"{i}  label={{{lbl!r}}}" if '"' in lbl else f'{i}  label="{lbl}"')
        al=ambil(props,'accessibilityLabel') or (('"'+attr_str(props,'accessibilityLabel')+'"') if attr_str(props,'accessibilityLabel') else None)
        if al: out.append(f"{i}  aksesLabel={{{al}}}" if not al.startswith('"') else f"{i}  aksesLabel={al}")
        ah=ambil(props,'accessibilityHint') or (('"'+attr_str(props,'accessibilityHint')+'"') if attr_str(props,'accessibilityHint') else None)
        if ah: out.append(f"{i}  aksesPetunjuk={{{ah}}}" if not ah.startswith('"') else f"{i}  aksesPetunjuk={ah}")
        dis=ambil(props,'disabled')
        if dis: out.append(f"{i}  nonaktif={{{dis}}}")
        st=ambil(props,'style') or ''
        if "alignSelf: 'center'" in st or "alignItems: 'center'" in st and 'flex-start' not in st: out.append(f'{i}  sejajar="tengah"')
        out.append(f"{i}  onPress={{{body}}}")
        out.append(f"{i}/>")
        n+=1
        return "\n".join(out)
    s2=pat.sub(rep,s)
    if n:
        s2=ensure(s2,f); open(f,'w').write(s2); print(f,n); tot+=n
print('total',tot)
