import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

def create_bvs_vertical_banner(
    character_img_path="pngegg-8.png",
    output_path="bvs_vertical_marvel_anton_allcaps.png",
    font_path="fonts/Anton.ttf",
    canvas_w=2560,
    canvas_h=1440,
    font_size=645,
    v_stretch=1.16,
    h_stretch=1.15,
    movie_y=55,
    night_y=755,
    m_start=None,                  # Auto-centers at x=1280.0 (445px)
    gaps_movie=[24, 8, 52, 54],    # [M-O, O-V, V-I, I-E] - optical kerning: snug O-V, generous breathing for V-I-E
    n_start=None,                  # Auto-centers at x=1280.5 (584px)
    gaps_night=[14, 10, 12, 10],   # [N-I, I-G, G-H, H-T] - tightened N to G distance down to 148px
    accent_color=(99, 85, 255),    # Movie Night Violet (#6355ff)
    transparent_bg=False,
    add_glow=True,
    character_scale=0.94
):
    # 1. Base Canvas
    if transparent_bg:
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    else:
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (6, 7, 10, 255))
        # Atmospheric dual-tone backdrop halo
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

    # 2. Characters (Batman v Superman)
    char_raw = Image.open(character_img_path).convert("RGBA")
    target_char_h = int(canvas_h * character_scale)
    scale_factor = target_char_h / char_raw.height
    target_char_w = int(char_raw.width * scale_factor)
    char_img = char_raw.resize((target_char_w, target_char_h), Image.Resampling.LANCZOS)
    char_x = (canvas_w - target_char_w) // 2
    char_y = canvas_h - target_char_h

    # 3. Typography with tight bounding boxes and balanced optical spacing
    font = ImageFont.truetype(font_path, font_size)

    def get_tight_letter(ch, fill):
        temp = Image.new("RGBA", (int(font_size * 2), int(font_size * 2)), (0, 0, 0, 0))
        d = ImageDraw.Draw(temp)
        d.text((50, 50), ch, font=font, fill=fill)
        bbox = temp.getbbox()
        cropped = temp.crop(bbox)
        orig_w, orig_h = cropped.size
        new_w = int(orig_w * h_stretch)
        new_h = int(orig_h * v_stretch)
        return cropped.resize((new_w, new_h), Image.Resampling.LANCZOS), new_w, new_h

    # MOVIE (White, Placed Higher at y=55, Dead-Centered at x=1280.0):
    # - M: starts at 445, ends at 942. Left 422px open, Batman covers 867..942.
    # - O: starts at 966, ends at 1281. Batman covers 966..1150, gap shows 1150..1281 (131px in gap!).
    # - V: starts at 1289, ends at 1621. Gap shows 1289..1480 (191px in gap!), Superman covers 1480..1621.
    # - I: starts at 1673, ends at 1797. Under Superman chest/cape.
    # - E: starts at 1851, ends at 2115. Extends proudly out to the right (264px wide)!
    # Gaps: [24, 8, 52, 54] creates true optical kerning balance between O-V and V-I-E.
    movie_letters = "MOVIE"
    m_rendered = [get_tight_letter(c, (255, 255, 255, 255)) for c in movie_letters]
    w_movie = sum(w for img, w, h in m_rendered) + sum(gaps_movie)
    if m_start is None:
        m_start = int(round((canvas_w - w_movie) / 2))

    movie_xs = []
    curr = m_start
    for (img, w, h), gap in zip(m_rendered, gaps_movie + [0]):
        movie_xs.append(curr)
        curr += w + gap

    # NIGHT (Accent Color, Placed Lower at y=755, Dead-Centered at x=1280.5):
    # - N: starts at 584, ends at 897. Left 181px open, Batman covers 765..897.
    # - I: starts at 911, ends at 1035. Under Batman.
    # - G: starts at 1045, ends at 1361. Batman covers 1045..1140, gap shows 1140..1361 (221px in gap!).
    # - H: starts at 1373, ends at 1688. Under Superman.
    # - T: starts at 1698, ends at 1977. Superman covers 1698..1794, extends 1794..1977 (179px to the right!).
    # Distance between N and G is tightened to 148px (down from 235px+).
    night_letters = "NIGHT"
    n_rendered = [get_tight_letter(c, (*accent_color, 255)) for c in night_letters]
    w_night = sum(w for img, w, h in n_rendered) + sum(gaps_night)
    if n_start is None:
        n_start = int(round((canvas_w - w_night) / 2))

    night_xs = []
    curr = n_start
    for (img, w, h), gap in zip(n_rendered, gaps_night + [0]):
        night_xs.append(curr)
        curr += w + gap

    # 4. Composite Text & Glow
    text_layer = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    glow_layer = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))

    for c, x, (img, w, h) in zip(movie_letters, movie_xs, m_rendered):
        glow_img, _, _ = get_tight_letter(c, (255, 255, 255, 125))
        text_layer.alpha_composite(img, (x, movie_y))
        glow_layer.alpha_composite(glow_img, (x, movie_y))

    for c, x, (img, w, h) in zip(night_letters, night_xs, n_rendered):
        glow_img, _, _ = get_tight_letter(c, (*accent_color, 190))
        text_layer.alpha_composite(img, (x, night_y))
        glow_layer.alpha_composite(glow_img, (x, night_y))

    if add_glow and not transparent_bg:
        glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=28))
        canvas.alpha_composite(glow_layer)

    canvas.alpha_composite(text_layer)

    # 5. Composite Characters in FRONT with subtle cinematic rim glow
    if add_glow and not transparent_bg:
        rim = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        c_alpha = char_img.split()[3]
        c_glow = Image.new("RGBA", char_img.size, (*accent_color, 85))
        c_glow.putalpha(c_alpha)
        rim.paste(c_glow, (char_x, char_y), c_alpha)
        rim = rim.filter(ImageFilter.GaussianBlur(radius=24))
        canvas.alpha_composite(rim)

    canvas.alpha_composite(char_img, (char_x, char_y))

    # 6. Bottom subtle vignette
    if not transparent_bg:
        fade = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        fd = ImageDraw.Draw(fade)
        fh = int(canvas_h * 0.12)
        for y in range(canvas_h - fh, canvas_h):
            prog = (y - (canvas_h - fh)) / fh
            fd.line([(0, y), (canvas_w, y)], fill=(6, 7, 10, int(255 * (prog ** 1.8))))
        canvas.alpha_composite(fade)

    canvas.save(output_path, "PNG", quality=95)
    print(f"Generated {output_path} successfully (MOVIE center={m_start + w_movie/2:.1f}, NIGHT center={n_start + w_night/2:.1f})")

if __name__ == "__main__":
    # 1. Primary: Brand Violet Accent (#6355ff)
    create_bvs_vertical_banner(
        output_path="bvs_vertical_marvel_anton_allcaps.png",
        accent_color=(99, 85, 255)
    )

    # 2. Transparent PNG (User requested @bvs_vertical_transparent.png)
    create_bvs_vertical_banner(
        output_path="bvs_vertical_transparent.png",
        accent_color=(99, 85, 255),
        transparent_bg=True,
        add_glow=False
    )

    # 3. Two Letter Centered 1280 (User referenced file)
    create_bvs_vertical_banner(
        output_path="bvs_two_letter_centered_1280.png",
        accent_color=(99, 85, 255)
    )

    # 4. Golden Dawn of Justice Edition (#f59e0b)
    create_bvs_vertical_banner(
        output_path="bvs_vertical_gold_edition.png",
        accent_color=(245, 158, 11)
    )

    # 5. Perfect Overlap Master
    create_bvs_vertical_banner(
        output_path="bvs_vertical_perfect_overlap.png",
        accent_color=(99, 85, 255)
    )

