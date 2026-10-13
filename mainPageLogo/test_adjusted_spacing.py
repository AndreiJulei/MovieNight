import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

def generate_adjusted_poster(
    output_path,
    font_size=645,
    v_stretch=1.16,
    h_stretch=1.15,
    movie_y=65,
    night_y=755,
    m_start=435,
    gaps_movie=[24, 16, 36, 38], # [M-O, O-V, V-I, I-E]
    n_start=525,
    gap_night=22,
    accent_color=(99, 85, 255),
    transparent_bg=False,
    add_glow=True
):
    canvas_w, canvas_h = 2560, 1440
    
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

    # MOVIE
    movie_letters = "MOVIE"
    m_rendered = [get_tight_letter(c, (255, 255, 255, 255)) for c in movie_letters]
    movie_xs = []
    curr = m_start
    for (img, w, h), gap in zip(m_rendered, gaps_movie + [0]):
        movie_xs.append(curr)
        curr += w + gap

    # NIGHT
    night_letters = "NIGHT"
    n_rendered = [get_tight_letter(c, (*accent_color, 255)) for c in night_letters]
    night_xs = []
    curr = n_start
    for img, w, h in n_rendered:
        night_xs.append(curr)
        curr += w + gap_night

    m_end = movie_xs[-1] + m_rendered[-1][1]
    n_end = night_xs[-1] + n_rendered[-1][1]
    print(f"=== {output_path} ===")
    print(f"MOVIE span: [{m_start}, {m_end}] (w={m_end-m_start}) center={(m_start+m_end)/2}")
    for c, x, (img, w, h) in zip(movie_letters, movie_xs, m_rendered):
        print(f"  {c}: [{x}, {x+w}] (w={w})")
    print(f"NIGHT span: [{n_start}, {n_end}] (w={n_end-n_start}) center={(n_start+n_end)/2}")
    for c, x, (img, w, h) in zip(night_letters, night_xs, n_rendered):
        print(f"  {c}: [{x}, {x+w}] (w={w})")
    print(f"Distance N to G: {night_xs[2] - (night_xs[0] + n_rendered[0][1])}px")
    print(f"Distance O to V: {movie_xs[2] - (movie_xs[1] + m_rendered[1][1])}px")
    print(f"Distance V to I: {movie_xs[3] - (movie_xs[2] + m_rendered[2][1])}px")
    print(f"Distance I to E: {movie_xs[4] - (movie_xs[3] + m_rendered[3][1])}px\n")

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

    if not transparent_bg:
        fade = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        fd = ImageDraw.Draw(fade)
        fh = int(canvas_h * 0.12)
        for y in range(canvas_h - fh, canvas_h):
            prog = (y - (canvas_h - fh)) / fh
            fd.line([(0, y), (canvas_w, y)], fill=(6, 7, 10, int(255 * (prog ** 1.8))))
        canvas.alpha_composite(fade)

    canvas.save(output_path, "PNG", quality=95)
    print(f"Saved {output_path}")

# Run variations:
# Variation 1: Centered at ~1260-1270, gap V-I=36, I-E=38, O-V=16, N-G gap reduced to 20px
generate_adjusted_poster("bvs_adjust_v1.png", m_start=430, gaps_movie=[24, 16, 36, 38], n_start=530, gap_night=20)

# Variation 2: Perfectly centered at 1280, slightly wider V-I-E (38, 42)
generate_adjusted_poster("bvs_adjust_v2.png", m_start=450, gaps_movie=[26, 16, 40, 42], n_start=555, gap_night=22)

# Variation 3: Balanced right shift with slightly larger tracking on NIGHT to match MOVIE width
generate_adjusted_poster("bvs_adjust_v3.png", m_start=420, gaps_movie=[22, 15, 34, 36], n_start=515, gap_night=24)
