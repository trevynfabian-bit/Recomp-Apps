import re, glob
pat=re.compile(r"""<Pressable\n(?P<props>(?:(?!</Pressable>|<Pressable).)*?)>\n\s*<Text style=\{\{ \.\.\.typography\.(?P<typ>\w+), color: (?P<col>[^}]+?) \}\}>(?P<lbl>[^<{]*)</Text>\n\s*</Pressable>""", re.S)
for f in sorted(glob.glob('app/**/*.tsx', recursive=True)+glob.glob('src/components/*.tsx')):
    s=open(f).read()
    for m in pat.finditer(s):
        ln=s[:m.start()].count('\n')+1
        print(f"{f}:{ln} [{m.group('typ')}|{m.group('col')}] {m.group('lbl').strip()!r}")
