import re, glob
# blok style objek (satu atau banyak baris) pada <View style={{ ... }}>
pat=re.compile(r"<View\s+(?:[a-zA-Z]+=\{[^}]*\}\s+)*style=\{\{(?P<st>(?:[^{}]|\{[^{}]*\})*)\}\}", re.S)
for f in sorted(glob.glob('app/**/*.tsx', recursive=True)+glob.glob('src/components/*.tsx')):
    if f.endswith('Card.tsx'): continue
    s=open(f).read()
    for m in pat.finditer(s):
        st=m.group('st'); ln=s[:m.start()].count('\n')+1
        kind=None
        if 'backgroundColor: colors.permukaan,' in st+',' and 'radius.lg' in st: kind='KARTU'
        elif 'colors.permukaanCekung' in st and 'radius.md' in st and 'padding' in st: kind='PANEL'
        elif re.search(r"height: 1,?\s*backgroundColor: colors\.garis", st) or re.search(r"width: 1,?\s*(alignSelf[^,]*,\s*)?backgroundColor: colors\.garis", st): kind='PEMISAH'
        if kind: print(kind, f"{f}:{ln}", ' '.join(st.split())[:110])
