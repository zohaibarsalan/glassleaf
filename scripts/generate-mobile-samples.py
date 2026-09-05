"""Original, redistributable reading fixtures; no personal library content."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
import zipfile, json, io, math
root=Path(__file__).resolve().parents[1]/'apps/mobile/assets/samples'
root.mkdir(parents=True,exist_ok=True)
font='/System/Library/Fonts/Supplemental/Georgia.ttf'
sans='/System/Library/Fonts/Supplemental/Arial.ttf'
items=[('the-quiet-atlas','The Quiet Atlas','Mira Ellis','novel','epub','#344E46','#EAD9A9'),('blue-hour','Blue Hour','A. Rivers','manga','cbz','#254B65','#D7D4AF'),('field-notes','Field Notes','Glassleaf Editions','document','pdf','#D7CBB3','#384939'),('a-small-infinity','A Small Infinity','Nora Vale','light-novel','epub','#CAB6C2','#3B3540'),('wild-islands','Wild Islands','Owen Reed','comic','cbz','#B96445','#F5E4C9'),('the-long-way','The Long Way Home','Eli Rowan','novel','epub','#DBB65B','#344537'),('moon-garden','Moon Garden','Ren Sora','manga','cbz','#344638','#E1DEB4'),('the-shape-of-light','The Shape of Light','Clara Finch','novel','epub','#B9C9C6','#233D44')]
manifest=[]
for idx,(slug,title,author,kind,fmt,bg,fg) in enumerate(items):
 image=Image.new('RGB',(600,900),bg);d=ImageDraw.Draw(image)
 d.rectangle((26,26,574,874),outline=fg,width=2)
 d.text((55,62),'GLASSLEAF / ORIGINAL EDITIONS',font=ImageFont.truetype(sans,16),fill=fg)
 # restrained cover art: an orbital landscape, unique per edition
 for j in range(5):
  cx=300+math.sin(idx+j)*65;cy=450+j*24
  d.arc((cx-160,cy-160,cx+160,cy+160),0,300,fill=fg,width=3)
 d.ellipse((268,388,332,452),fill=fg)
 words=title.split();lines=[];line=''
 for word in words:
  if len(line+' '+word)>16:lines.append(line);line=word
  else:line=(line+' '+word).strip()
 lines.append(line)
 for j,line in enumerate(lines):d.text((55,145+j*65),line,font=ImageFont.truetype(font,48),fill=fg)
 d.text((55,785),author.upper(),font=ImageFont.truetype(sans,22),fill=fg)
 d.text((55,828),f'{idx+1:02d}    /    {kind.upper().replace("-"," ")}',font=ImageFont.truetype(sans,15),fill=fg)
 image.save(root/f'{slug}.jpg',quality=90)
 chapters=[]
 for n in range(1,7):
  paragraphs=[f'The morning of the {n}th journey began without a map. Beyond the window, the hills carried a quiet green light. There was time to look closely, to notice the small paths between familiar things.', 'I placed the notebook on the table and opened it to a clean page. A story does not always arrive as a great event. Sometimes it is simply a place, a voice, or the decision to take the longer road.', 'Outside, the world continued at its own pace. The trees moved in the wind; somewhere a door closed. We followed the trail until the town was a small shape behind us. There was nothing to hurry toward.']*8
  body=''.join(f'<p>{p}</p>' for p in paragraphs)
  html=f'<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter {n}</title><meta charset="utf-8"/></head><body><h1>Chapter {n}</h1>{body}</body></html>'
  chapters.append(html)
 if fmt=='epub':
  with zipfile.ZipFile(root/f'{slug}.epub','w') as z:
   z.writestr('mimetype','application/epub+zip',compress_type=zipfile.ZIP_STORED)
   z.writestr('META-INF/container.xml','<container><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>')
   entries=''.join(f'<item id="c{n}" href="chapter{n}.xhtml" media-type="application/xhtml+xml"/>' for n in range(1,7))
   spine=''.join(f'<itemref idref="c{n}"/>' for n in range(1,7))
   z.writestr('content.opf',f'<package><metadata><title>{title}</title><creator>{author}</creator><language>en</language></metadata><manifest><item id="cover" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>{entries}</manifest><spine>{spine}</spine></package>')
   z.write(root/f'{slug}.jpg','cover.jpg')
   for n,html in enumerate(chapters,1):z.writestr(f'chapter{n}.xhtml',html)
 elif fmt=='pdf':
  c=canvas.Canvas(str(root/f'{slug}.pdf'));c.setTitle(title);c.setAuthor(author)
  for n in range(1,9):
   c.setFillColor(bg);c.rect(0,0,600,850,fill=1,stroke=0);c.setFillColor(fg);c.setFont('Times-Roman',34);c.drawString(48,760,title);c.setFont('Helvetica',12);c.drawString(48,724,f'Observations from the trail / {n:02d}')
   for j in range(12):c.drawString(48,670-j*25,'Leave room in the day to notice something new.')
   c.drawString(48,50,f'Glassleaf original reading sample  /  {n}');c.showPage()
  c.save()
 else:
  with zipfile.ZipFile(root/f'{slug}.cbz','w',zipfile.ZIP_DEFLATED) as z:
   z.write(root/f'{slug}.jpg','page01.jpg')
   for n in range(2,13):
    im=Image.new('RGB',(800,1200),'#F4F0E4');dr=ImageDraw.Draw(im)
    for j in range(3):
     y=30+j*380;dr.rectangle((30,y,770,y+350),fill=bg,outline=fg,width=3)
     dr.ellipse((540,y+35,670,y+165),fill=fg)
     dr.polygon([(30,y+350),(300,y+140),(510,y+350)],fill=fg)
     dr.rectangle((70,y+260,410,y+315),fill='#F4F0E4');dr.text((86,y+276),['A quiet beginning.','Beyond the familiar path.','The story continues.'][j],font=ImageFont.truetype(sans,20),fill=bg)
    data=io.BytesIO();im.save(data,format='JPEG',quality=85);z.writestr(f'page{n:02d}.jpg',data.getvalue())
 manifest.append({'slug':slug,'title':title,'author':author,'kind':kind,'format':fmt,'color':bg})
(root/'manifest.json').write_text(json.dumps(manifest,indent=2))
