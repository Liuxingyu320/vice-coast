"""Draw the original shop graphics and modular window bays for the Tokyo set."""
from pathlib import Path
from functools import lru_cache
import math
import random
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent / 'textures'
OUT.mkdir(exist_ok=True)
FONTDIR = Path('/System/Library/Fonts')
jp = next(FONTDIR.glob('* W6.ttc'))
latin = FONTDIR/'Supplemental/DIN Condensed Bold.ttf'
atlas = Image.new('RGB',(2048,2048),'#242d36')
tiles = {}

@lru_cache()
def font(size, english):
    return ImageFont.truetype(str(latin if english else jp),size)

def write(d,x,y,txt,size,color,english=False,anchor='mm'):
    d.text((x,y),txt,font=font(size,english),fill=color,anchor=anchor,stroke_width=0)

def tile(key,x,y,w,h,bg):
    panel=Image.new('RGB',(w,h),bg)
    tiles[key]=[x,y,w,h]
    return panel,ImageDraw.Draw(panel)

shops=[
 ('波音レコード','NAMiOTO   /   RECORDS & TAPES','#10383c','#ffde96'),
 ('喫茶こはく','KISSA KOHAKU   /   COFFEE ROASTERS','#813822','#ffe0a3'),
 ('月見そば','TSUKIMI   /   SOBA & UDON','#172f45','#f6ae61'),
 ('有明写真館','ARIAKE   /   CAMERA & FILM','#f1dfaa','#243348'),
 ('らーめん 銀波','GINPA   /   NOODLE COUNTER','#aa352c','#ffe8af'),
 ('つばめ薬局','TSUBAME   /   PHARMACY','#165c51','#f0e4b6'),
 ('山吹書房','YAMABUKI   /   BOOKS','#243f6c','#eacb91'),
 ('港町市場','MINATOMACHI   /   FRESH MARKET','#d28a3c','#1b3734'),
 ('東京ベイホテル','TOKYO BAY   /   HOTEL','#203f51','#f6bd70'),
 ('桜湯','SAKURA-YU   /   PUBLIC BATH','#9d4b57','#fbe6c2'),
 ('芝浦電機','SHIBAURA   /   ELECTRONICS','#d4d5c4','#213949'),
 ('深川食堂','FUKAGAWA   /   TEISHOKU','#603b30','#ffe6ae'),
 ('台場海浜公園','DAIBA   /   WATERFRONT PARK','#19566b','#f8edc8'),
 ('東湾線   有明駅','TO-WAN LINE   /   ARIAKE STATION','#163f48','#f4e9be'),
 ('湾岸通り','WANGAN-DORI   /   TOKYO','#264e84','#fff2d4'),
 ('潮見桟橋','SHIOMI PIER   /   TOKYO BAY','#26465c','#f4d29c')]
for i,(label,en,bg,fg) in enumerate(shops):
    x,y=i%4*512,i//4*128
    p,d=tile('s'+str(i),x,y,512,128,bg)
    d.rectangle((5,5,506,122),outline=fg,width=2)
    d.rectangle((15,16,22,109),fill=fg)
    write(d,260,53,label,55 if len(label)<7 else 49,fg)
    write(d,260,103,en,21,fg,True)
    atlas.paste(p,(x,y))

verticals=[('レコード','#efba62','#552b2c'),('純喫茶','#f6d6ae','#963830'),('居酒屋','#b5372f','#ffe5aa'),('写眞館','#137587','#eef2da'),('ホテル','#204c67','#d7eff0'),('大衆食堂','#eed698','#2e4247'),('薬局','#236855','#f9e2bd'),('古書店','#e5b5bb','#452e52')]
for i,(label,bg,fg) in enumerate(verticals):
    x=i*128;p,d=tile('v'+str(i),x,512,128,512,bg)
    d.rectangle((5,4,122,507),outline=fg,width=3)
    d.ellipse((42,20,86,64),outline=fg,width=4);d.line((49,49,80,34),fill=fg,width=4)
    for j,ch in enumerate(label):write(d,64,99+(j+.5)*330/len(label),ch,77,fg)
    write(d,64,478,'TOKYO',23,fg,True)
    atlas.paste(p,(x,512))

# Each billboard has its own illustration, typography, and palette.
for i,(bg,fg,accent) in enumerate([('#0c353a','#ffce76','#ee5b40'),('#eee2ba','#263d63','#e25337'),('#18394d','#ffdb8d','#43b6af'),('#a83934','#ffe2a7','#54283b')]):
    x=i*512;p,d=tile('p'+str(i),x,1024,512,640,bg)
    d.rectangle((13,13,498,625),outline=fg,width=2)
    write(d,31,36,['NAMIOTO RECORDS','SUMIDA PRINT WORKS','TOKYO BAY TRANSIT','GINPA SHOKUDO'][i],19,fg,True,'lm')
    write(d,478,37,['33⅓','03','T-07','12'][i],22,fg,True,'rm')
    if i==0:
        d.ellipse((35,79,476,520),fill='#17292d',outline=fg,width=5)
        for j in range(18):
            k=11+j*7;d.arc((35+k,79+k,476-k,520-k),25,287,fill=('#608577' if j%3 else fg),width=2)
        d.ellipse((189,232,322,365),fill=accent);d.ellipse((248,291,263,306),fill=bg)
        write(d,256,516,'波  音',88,fg);write(d,256,590,'ANALOG AFTER HOURS',25,fg,True)
    elif i==1:
        d.ellipse((210,86,415,291),fill=accent)
        d.polygon([(25,398),(129,273),(174,310),(291,162),(482,386),(482,428),(25,428)],fill=fg)
        d.polygon([(202,276),(291,162),(348,230),(310,211),(295,236),(267,214)],fill='#f6edcf')
        for j in range(8):d.line([(26,404+j*8),(125,385+j*8),(239,417+j*6),(481,382+j*8)],fill=accent,width=3)
        write(d,255,514,'山と海',85,fg);write(d,255,590,'LANDSCAPE   /   PRINT EXHIBITION',24,fg,True)
    elif i==2:
        for j in range(6):
            d.line([(32,390+j*11),(184,390+j*11),(354,145+j*11),(480,145+j*11)],fill=accent,width=5)
        for xx,yy in [(115,390),(265,274),(417,145)]:
            d.ellipse((xx-15,yy-15,xx+15,yy+15),fill=bg,outline=fg,width=6)
        write(d,257,508,'東 湾 線',77,fg);write(d,254,590,'TO-WAN LINE   /   CITY TO SEA',25,fg,True)
    else:
        for j in range(5):d.arc((158+j*28,142,206+j*28,283),90,278,fill=fg,width=5)
        d.pieslice((65,183,450,445),0,180,fill=fg);d.rectangle((199,434,319,445),fill=fg)
        d.line((111,230,443,100),fill=accent,width=10);d.line((127,245,458,121),fill=accent,width=10)
        write(d,256,514,'銀 波',90,fg);write(d,256,590,'MIDNIGHT NOODLE COUNTER',25,fg,True)
    atlas.paste(p,(x,1024))

for i in range(3):
    x=1024+i*212;p,d=tile('vend'+str(i),x,512,212,500,['#a92d32','#146077','#ece4bf'][i])
    d.rounded_rectangle((10,21,202,237),8,fill='#cfebe2',outline='#193c4a',width=4)
    for row in range(3):
        for col in range(7):
            xx,yy=18+col*26,36+row*65
            d.rounded_rectangle((xx,yy,xx+13,yy+37),3,fill=['#c54132','#72974e','#dd9c45','#357797'][(col+row+i)%4])
            d.rectangle((xx+2,yy+11,xx+11,yy+22),fill='#efe1af');d.rectangle((xx+3,yy-4,xx+10,yy),fill='#4c6464')
        d.rectangle((14,yy+41,196,yy+47),fill='#637d81')
    write(d,70,286,'COFFEE',24,'#f8d7a1',True)
    d.rectangle((130,263,195,321),fill='#263b40');d.rectangle((139,273,175,286),fill='#8cc59c')
    d.rounded_rectangle((28,375,182,422),7,fill='#23333a',outline='#809293',width=4)
    atlas.paste(p,(x,512))
atlas.save(OUT/'signs.png',optimize=True)
import json
(OUT/'tiles.json').write_text(json.dumps(tiles,indent=2)+'\n')

# Seamless 2-bay by 2-floor tiles. Window emission is masked to the glass only.
for i,(wall,frame,glass) in enumerate([('#ac9d87','#676965','#36515e'),('#77858a','#46545d','#354e61'),('#b88b75','#675650','#364957'),('#5f707a','#253e4b','#385968')]):
    r=random.Random(101+i)
    p=Image.new('RGB',(256,256),wall);d=ImageDraw.Draw(p)
    em=Image.new('RGB',(256,256),'black');e=ImageDraw.Draw(em)
    for yy in range(0,256,8):d.line((0,yy,255,yy),fill=tuple(int(v*.88) for v in p.getpixel((1,1))))
    for row in range(2):
        for col in range(2):
            x,y=col*128,row*128
            d.rectangle((x+8,y+12,x+119,y+94),fill=frame)
            light=(i+row+col*2)%4!=1
            for b in range(2):
                xx=x+14+b*51
                c=(['#ceb88e','#9dadac','#ddba8f','#9daead'][(i+b+row)%4] if light else glass)
                d.rectangle((xx,y+18,xx+44,y+88),fill=c)
                if light:e.rectangle((xx,y+18,xx+44,y+88),fill=['#e4a360','#8ca6a2','#e2ba83','#9eb9b9'][(i+b+row)%4])
                n=3+(col+b+row)%6
                for j in range(n):
                    d.line((xx,y+20+j*5,xx+44,y+20+j*5),fill=frame,width=2)
                    e.line((xx,y+20+j*5,xx+44,y+20+j*5),fill='#302e29',width=2)
            d.rectangle((x+5,y+94,x+121,y+98),fill=frame)
    p.save(OUT/f'bays{i}.png');em.save(OUT/f'lights{i}.png')
