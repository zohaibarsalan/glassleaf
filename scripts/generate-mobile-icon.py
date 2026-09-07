"""Render Glassleaf's original geometric book/leaf mark (Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parents[1] / 'apps/mobile/assets'
SIZE = 1024

def mark(background, foreground, scale=1):
    image = Image.new('RGBA', (SIZE, SIZE), background)
    draw = ImageDraw.Draw(image)
    def curve(a, b, c, d):
        return [tuple((1-t)**3*a[i]+3*(1-t)**2*t*b[i]+3*(1-t)*t*t*c[i]+t**3*d[i] for i in (0,1)) for t in [n/80 for n in range(81)]]
    left = curve((480,720),(415,660),(295,686),(278,605)) + [(278,305)] + curve((278,305),(367,292),(446,330),(480,370))
    right = curve((536,700),(745,606),(773,401),(730,280)) + curve((730,280),(560,313),(524,445),(536,700))
    draw.polygon(left, fill=foreground)
    draw.polygon(right, fill=foreground)
    draw.polygon(curve((542,647),(571,562),(625,484),(682,401)) + list(reversed(curve((558,653),(587,568),(641,490),(698,411)))), fill=background if background[3] else (0,0,0,0))
    if scale != 1:
        small = image.resize((int(SIZE*scale),)*2, Image.Resampling.LANCZOS)
        image = Image.new('RGBA',(SIZE,SIZE),background)
        image.alpha_composite(small, ((SIZE-small.width)//2,)*2)
    return image

paper=(246,245,238,255); green=(38,72,57,255)
mark(green,paper).convert('RGB').save(ROOT/'icon.png')
mark((0,0,0,0),paper,.75).save(ROOT/'android-icon-foreground.png')
mark((0,0,0,0),(255,255,255,255),.75).save(ROOT/'android-icon-monochrome.png')
Image.new('RGB',(SIZE,SIZE),green[:3]).save(ROOT/'android-icon-background.png')
mark(green,paper).resize((48,48),Image.Resampling.LANCZOS).save(ROOT/'favicon.png')
