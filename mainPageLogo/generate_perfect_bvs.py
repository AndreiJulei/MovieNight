import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

def build_bvs_poster(
    output_filename,
    font_size=560,
    v_stretch=1.28,
    h_stretch=1.08,
    m_x=450,
    o_x=915,
    v_x=1175,
    i_x=1445,
    e_x=1640,
    n_x=475,
    ni_x=820,
    g_x=1030,
    h_x=1360,
    t_x=1680,
    accent_color=(99, 85, 255),
    movie_y=190,
    night_y=790,
    transparent_bg=False,
    add_glow=True
):
    canvas_w, canvas_h = 2560, 1440
    
    # 1. Background
    if transparent_bg:
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    else:
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (6, 7, 10, 255))
        bg = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        bg_draw = ImageDraw.Draw(bg)
        cx, cy = canvas_w // 2, canvas_h // 2
        for r in range(int(canvas_h * 0.78), 0, -25):
            norm = 1.0 - (r / (canvas_h * 0.78))
            alpha = int(48 * (norm ** 1.6))
            bg_draw.ellipse(
                (cx - int(r * 1.7), cy - r, cx + int(r * 1.7), cy + r),
                fill=(*accent_color[:3], alpha)
            )
        bg = bg.filter(ImageFilter.GaussianBlur(radius=65))
        canvas.alpha_composite(bg)

    # 2. Character Setup
    char_raw = Image.open("pngegg-8.png").convert("RGBA")
    target_char_h = int(canvas_h * 0.94)
    scale_factor = target_char_h / char_raw.height
    target_char_w = int(char_raw.width * scale_factor)
    char_img = char_raw.resize((target_char_w, target_char_h), Image.Resampling.LANCZOS)
    char_x = (canvas_w - target_char_w) // 2
    char_y = canvas_h - target_char_h

    # 3. Font
    font = ImageFont.truetype("fonts/Anton.ttf", font_size)

    def render_letter(ch, fill):
        bbox = font.getbbox(ch)
        w = bbox[2] - bbox[0] + 40
        h = bbox[3] - bbox[1] + 40
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.text((-bbox[0] + 20, -bbox[1] + 20), ch, font=font, fill=fill)
        new_w = int(w * h_stretch)
        new_h = int(h * v_stretch)
        img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        return img, new_w, new_h

    movie_letters = ["M", "O", "V", "I", "E"]
    movie_xs = [m_x, o_x, v_x, i_x, e_x]

    night_letters = ["N", "I", "G", "H", "T"]
    night_xs = [n_x, ni_x, g_x, h_x, t_x]

    text_layer = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    glow_layer = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))

    # Render MOVIE (Pure White with subtle silver glow)
    for ch, x in zip(movie_letters, movie_xs):
        img, w, h = render_letter(ch, (255, 255, 255, 255))
        glow, _, _ = render_letter(ch, (255, 255, 255, 120))
        text_layer.alpha_composite(img, (x, movie_y))
        glow_layer.alpha_composite(glow, (x, movie_y))

    # Render NIGHT (Accent Color)
    for ch, x in zip(night_letters, night_xs):
        img, w, h = render_letter(ch, (*accent_color, 255))
        glow, _, _ = render_letter(ch, (*accent_color, 190))
        text_layer.alpha_composite(img, (x, night_y))
        glow_layer.alpha_composite(glow, (x, night_y))

    if add_glow:
        glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=28))
        canvas.alpha_composite(glow_layer)

    canvas.alpha_composite(text_layer)

    # Rim glow around Batman and Superman
    if add_glow and not transparent_bg:
        rim = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        c_alpha = char_img.split()[3]
        c_glow = Image.new("RGBA", char_img.size, (*accent_color, 85))
        c_glow.putalpha(c_alpha)
        rim.paste(c_glow, (char_x, char_y), c_alpha)
        rim = rim.filter(ImageFilter.GaussianBlur(radius=24))
        canvas.alpha_composite(rim)

    # Characters in front
    canvas.alpha_composite(char_img, (char_x, char_y))

    # Vignette
    if not transparent_bg:
        fade = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        fd = ImageDraw.Draw(fade)
        fh = int(canvas_h * 0.12)
        for y in range(canvas_h - fh, canvas_h):
            prog = (y - (canvas_h - fh)) / fh
            fd.line([(0, y), (canvas_w, y)], fill=(6, 7, 10, int(255 * (prog ** 1.8))))
        canvas.alpha_composite(fade)

    canvas.save(output_filename, "PNG", quality=95)
    print(f"Created {output_filename}")

# Run variations
# V1: Precise 2-letter partial overlap centered
build_bvs_poster("bvs_two_letter_overlap_v1.png", font_size=560, v_stretch=1.28, h_stretch=1.08,
                 m_x=440, o_x=915, v_x=1175, i_x=1445, e_x=1640,
                 n_x=475, ni_x=820, g_x=1030, h_x=1360, t_x=1680)

# V2: Slightly wider with more M and E extending beyond characters
build_bvs_poster("bvs_two_letter_overlap_v2.png", font_size=580, v_stretch=1.25, h_stretch=1.12,
                 m_x=380, o_x=890, v_x=1160, i_x=1455, e_x=1670,
                 n_x=420, ni_x=800, g_x=1010, h_x=1365, t_x=1710)

# V3: Grand Blockbuster wide
build_bvs_poster("bvs_two_letter_overlap_v3.png", font_size=610, v_stretch=1.22, h_stretch=1.18,
                 m_x=320, o_x=860, v_x=1150, i_x=1465, e_x=1710,
                 n_x=360, ni_x=780, g_x=990, h_x=1370, t_x=1750)
