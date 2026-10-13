import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

def build_perfect_poster(
    output_filename,
    font_size=635,
    v_stretch=1.16,
    h_stretch=1.14,
    movie_y=65,
    night_y=755,
    m_start=390,
    gap_movie=18,
    n_start=480,
    gap_night=48,
    accent_color=(99, 85, 255),
    transparent_bg=False,
    add_glow=True
):
    canvas_w, canvas_h = 2560, 1440

    if transparent_bg:
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    else:
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (6, 7, 10, 255))
        # Atmospheric dual-tone background
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

    # Characters
    char_raw = Image.open("pngegg-8.png").convert("RGBA")
    target_char_h = int(canvas_h * 0.94)
    scale_factor = target_char_h / char_raw.height
    target_char_w = int(char_raw.width * scale_factor)
    char_img = char_raw.resize((target_char_w, target_char_h), Image.Resampling.LANCZOS)
    char_x = (canvas_w - target_char_w) // 2
    char_y = canvas_h - target_char_h

    # Typography
    font = ImageFont.truetype("fonts/Anton.ttf", font_size)

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

    movie_letters = "MOVIE"
    m_rendered = [get_tight_letter(c, (255, 255, 255, 255)) for c in movie_letters]
    movie_xs = []
    curr = m_start
    for img, w, h in m_rendered:
        movie_xs.append(curr)
        curr += w + gap_movie

    night_letters = "NIGHT"
    n_rendered = [get_tight_letter(c, (*accent_color, 255)) for c in night_letters]
    night_xs = []
    curr = n_start
    for img, w, h in n_rendered:
        night_xs.append(curr)
        curr += w + gap_night

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

    # Rim glow
    if add_glow and not transparent_bg:
        rim = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        c_alpha = char_img.split()[3]
        c_glow = Image.new("RGBA", char_img.size, (*accent_color, 85))
        c_glow.putalpha(c_alpha)
        rim.paste(c_glow, (char_x, char_y), c_alpha)
        rim = rim.filter(ImageFilter.GaussianBlur(radius=24))
        canvas.alpha_composite(rim)

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
    print(f"Generated {output_filename}")

# Candidate 1: Strict equal spacing (18px MOVIE, 48px NIGHT), movie_y=65, night_y=755
build_perfect_poster(
    "bvs_perfect_spacing_v1.png",
    font_size=635, v_stretch=1.16, h_stretch=1.14,
    movie_y=65, night_y=755,
    m_start=390, gap_movie=18,
    n_start=480, gap_night=48
)

# Candidate 2: Slightly wider letters (h_stretch=1.18, gap_movie=22, gap_night=42)
build_perfect_poster(
    "bvs_perfect_spacing_v2.png",
    font_size=645, v_stretch=1.15, h_stretch=1.18,
    movie_y=60, night_y=755,
    m_start=360, gap_movie=22,
    n_start=460, gap_night=42
)

# Candidate 3: Unified spacing gap (~30px for both words)
build_perfect_poster(
    "bvs_perfect_spacing_v3.png",
    font_size=640, v_stretch=1.15, h_stretch=1.16,
    movie_y=60, night_y=755,
    m_start=370, gap_movie=28,
    n_start=440, gap_night=32
)
