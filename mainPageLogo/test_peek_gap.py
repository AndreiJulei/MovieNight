import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

from generate_perfect_bvs import build_bvs_poster

# Let's test a couple of subtle tweaks to see how I and H peek:
# Option A: Current v2 (Clean V in gap, clean G in gap, bold M/O on left, E/T on right)
# Option B: Gap peeking (O, V, I partially peeking in gap; G and H partially peeking in gap)
build_bvs_poster("bvs_two_letter_peeking.png", font_size=580, v_stretch=1.25, h_stretch=1.12,
                 m_x=380, o_x=890, v_x=1150, i_x=1380, e_x=1670,
                 n_x=420, ni_x=800, g_x=1010, h_x=1310, t_x=1710)

# Option C: Extra wide balanced center
build_bvs_poster("bvs_two_letter_centered_1280.png", font_size=580, v_stretch=1.25, h_stretch=1.12,
                 m_x=360, o_x=880, v_x=1155, i_x=1420, e_x=1680,
                 n_x=400, ni_x=790, g_x=1015, h_x=1340, t_x=1730)
