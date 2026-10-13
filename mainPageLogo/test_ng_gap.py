from PIL import Image, ImageFont
import numpy as np

font_size = 645
h_stretch = 1.15
v_stretch = 1.16
font = ImageFont.truetype('fonts/Anton.ttf', font_size)

# Measure tight letter widths
def get_w(ch):
    from PIL import ImageDraw
    temp = Image.new('RGBA', (font_size*2, font_size*2), (0,0,0,0))
    d = ImageDraw.Draw(temp)
    d.text((50,50), ch, font=font, fill=(255,255,255,255))
    bbox = temp.getbbox()
    return int((bbox[2]-bbox[0]) * h_stretch)

w_N = get_w('N')
w_I = get_w('I')
w_G = get_w('G')
w_H = get_w('H')
w_T = get_w('T')

print(f'N={w_N}, I={w_I}, G={w_G}, H={w_H}, T={w_T}')

# Let us test:
# If gap_night = 18px:
# gap between N and G is gap + w_I + gap = 18 + 124 + 18 = 160px.
# What if gap between N and I is 16px, and between I and G is 16px? -> 16 + 124 + 16 = 156px!
# Total NIGHT width with 18px gaps:
# w_N + w_I + w_G + w_H + w_T + 4*18 = 1347 + 72 = 1419px.
# Centered at 1280:
# start_n = 1280 - 1419 // 2 = 570!
# N: [570, 570 + 313] = [570, 883].
# I: [901, 1025]
# G: [1043, 1359]
# H: [1377, 1692]
# T: [1710, 1989]
# End = 1989. Center = (570 + 1989)/2 = 1279.5!
# Distance N to G: 1043 - 883 = 160px!
# Batman covers N from 765 to 883 (118px).
# Batman covers G from 1043 to 1210 (167px).
# Gap has 1210 to 1359 (149px of G in the gap!).
# Superman covers T from 1710 to 1794 (84px).
# T extends from 1794 to 1989 (195px extends to the right!).
print('Perfect NIGHT geometry calculated!')
