import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

def generate_banner(
    output_path,
    font_size=580,
    v_stretch=1.25,
    h_stretch=1.0,
    movie_y_offset=0,
    night_y_offset=0,
    accent_color=(99, 85, 255),
    spacing_boost=0
):
    canvas_w, canvas_h = 2560, 1440
    canvas = Image.new("RGBA", (canvas_w, canvas_h), (6, 7, 10, 255))
    
    # 1. Atmospheric backdrop
    bg = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)
    cx, cy = canvas_w // 2, canvas_h // 2
    for r in range(int(canvas_h * 0.75), 0, -25):
        norm = 1.0 - (r / (canvas_h * 0.75))
        alpha = int(48 * (norm ** 1.6))
        bg_draw.ellipse(
            (cx - int(r * 1.7), cy - r, cx + int(r * 1.7), cy + r),
            fill=(*accent_color[:3], alpha)
        )
    bg = bg.filter(ImageFilter.GaussianBlur(radius=65))
    canvas.alpha_composite(bg)

    # 2. Characters
    char_raw = Image.open("pngegg-8.png").convert("RGBA")
    target_char_h = int(canvas_h * 0.94)
    scale_factor = target_char_h / char_raw.height
    target_char_w = int(char_raw.width * scale_factor)
    char_img = char_raw.resize((target_char_w, target_char_h), Image.Resampling.LANCZOS)
    char_x = (canvas_w - target_char_w) // 2
    char_y = canvas_h - target_char_h

    # 3. Typography
    font = ImageFont.truetype("fonts/Anton.ttf", font_size)

    def render_letter(ch, fill):
        bbox = font.getbbox(ch)
        w = bbox[2] - bbox[0] + 50
        h = bbox[3] - bbox[1] + 50
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.text((-bbox[0] + 25, -bbox[1] + 25), ch, font=font, fill=fill)
        new_w = int(w * h_stretch)
        new_h = int(h * v_stretch)
        if new_w != w or new_h != h:
            img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        return img, new_w, new_h

    # MOVIE Letters: M, O, V, I, E
    # Target:
    # - M starts left of Batman (~460-500)
    # - Batman covers right side of M and left side of O
    # - Gap shows right side of O, V, and left side of I
    # - Superman covers right side of I and left side of E
    # - E extends to the right of Superman (~1800-1950)
    # Total width centered around cx=1280
    
    # Calculate natural letter widths
    movie_imgs = [render_letter(c, (255, 255, 255, 255)) for c in "MOVIE"]
    night_imgs = [render_letter(c, (*accent_color, 255)) for c in "NIGHT"]
    
    m_widths = [img[1] for img in movie_imgs]
    n_widths = [img[1] for img in night_imgs]
    
    # MOVIE placement:
    # Batman at MOVIE row: [790, 1150] | Gap: [1150, 1400] | Superman: [1400, 1735]
    # M: start at 470 -> width ~450 -> ends at 920. Batman (at 790) covers 790..920 (130px). Left 320px open!
    # O: start at 930 -> width ~300 -> ends at 1230. Batman covers 930..1150 (220px). Gap has 1150..1230 (80px)!
    # V: centered at 1280 -> start at 1140 -> ends at 1420. In the gap!
    # I: start at 1440 -> width ~140 -> ends at 1580. Superman covers 1440..1580.
    # E: start at 1610 -> width ~250 -> ends at 1860+. Superman ends at 1735. Right 125px+ open!
    movie_xs = [
        470 - spacing_boost,
        930 - spacing_boost // 2,
        1140,
        1440 + spacing_boost // 2,
        1610 + spacing_boost
    ]
    movie_y = int(canvas_h * 0.33) - 240 + movie_y_offset

    # NIGHT placement:
    # Batman at NIGHT row: [765, 1211] | Gap: [1211, 1342] | Superman: [1342, 1794]
    # N: start at 520 -> width ~300 -> ends at 820. Batman (765) covers 765..820 (55px, end of N). Left 245px open!
    # I: start at 860 -> under Batman
    # G: start at 1040 -> ends at 1330. Batman covers 1040..1211. Gap has 1211..1330 (119px in gap)!
    # H: start at 1360 -> ends at 1650. Superman covers 1360..1650.
    # T: start at 1680 -> ends at 1920+. Superman ends at 1794. Right 130px+ open!
    night_xs = [
        520 - spacing_boost,
        860 - spacing_boost // 2,
        1040,
        1360 + spacing_boost // 2,
        1680 + spacing_boost
    ]
    night_y = int(canvas_h * 0.72) - 240 + night_y_offset

    # Text & glow layers
    text_layer = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    glow_layer = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))

    for (img, w, h), x in zip(movie_imgs, movie_xs):
        glow, _, _ = render_letter("MOVIE"[movie_imgs.index((img, w, h))], (255, 255, 255, 130))
        text_layer.alpha_composite(img, (x, movie_y))
        glow_layer.alpha_composite(glow, (x, movie_y))

    for (img, w, h), x in zip(night_imgs, night_xs):
        glow, _, _ = render_letter("NIGHT"[night_imgs.index((img, w, h))], (*accent_color, 200))
        text_layer.alpha_composite(img, (x, night_y))
        glow_layer.alpha_composite(glow, (x, night_y))

    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=28))
    canvas.alpha_composite(glow_layer)
    canvas.alpha_composite(text_layer)

    # Character rim glow
    rim = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    c_alpha = char_img.split()[3]
    c_glow = Image.new("RGBA", char_img.size, (*accent_color, 90))
    c_glow.putalpha(c_alpha)
    rim.paste(c_glow, (char_x, char_y), c_alpha)
    rim = rim.filter(ImageFilter.GaussianBlur(radius=24))
    canvas.alpha_composite(rim)

    # Characters in front
    canvas.alpha_composite(char_img, (char_x, char_y))

    # Vignette at bottom
    fade = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fade)
    fh = int(canvas_h * 0.12)
    for y in range(canvas_h - fh, canvas_h):
        prog = (y - (canvas_h - fh)) / fh
        fd.line([(0, y), (canvas_w, y)], fill=(6, 7, 10, int(255 * (prog ** 1.8))))
    canvas.alpha_composite(fade)

    canvas.save(output_path, "PNG", quality=95)
    print(f"Saved {output_path}")

# Run configurations
generate_banner("bvs_wide_v1.png", font_size=580, v_stretch=1.25, h_stretch=1.0, spacing_boost=0)
generate_banner("bvs_wide_v2.png", font_size=620, v_stretch=1.25, h_stretch=1.1, spacing_boost=40)
generate_banner("bvs_wide_v3.png", font_size=660, v_stretch=1.20, h_stretch=1.15, spacing_boost=80)
