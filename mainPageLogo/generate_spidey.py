import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

def create_spidey_vertical_banner(
    character_img_path="pngegg-5.png",
    output_path="spidey_vertical_marvel_red.png",
    font_path="fonts/Anton.ttf",
    canvas_w=2560,
    canvas_h=1440,
    font_size=645,
    v_stretch=1.16,
    h_stretch=1.15,
    movie_y=55,
    night_y=755,
    m_start=None,                  # Auto-centers at x=1280.0
    gaps_movie=[24, 8, 52, 54],    # Snug O-V, balanced breathing for V-I-E
    n_start=None,                  # Auto-centers at x=1280.5
    gaps_night=[14, 10, 12, 10],   # Tightened N-G distance
    accent_color=(230, 36, 41),    # Marvel / Spidey Red (#e62429)
    transparent_bg=False,
    add_glow=True,
    spidey_scale=0.776,
    spidey_top=3
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

    # 2. Typography
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

    # MOVIE (White, Placed in Top Half at y=55, Dead-Centered at x=1280.0):
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

    # NIGHT (Accent Color, Placed Right Below Feet at y=755, Dead-Centered at x=1280.5):
    night_letters = "NIGHT"
    n_rendered = [get_tight_letter(c, (*accent_color[:3], 255)) for c in night_letters]
    w_night = sum(w for img, w, h in n_rendered) + sum(gaps_night)
    if n_start is None:
        n_start = int(round((canvas_w - w_night) / 2))

    night_xs = []
    curr = n_start
    for (img, w, h), gap in zip(n_rendered, gaps_night + [0]):
        night_xs.append(curr)
        curr += w + gap

    # 3. Composite Text & Glow
    text_layer = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    glow_layer = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))

    for c, x, (img, w, h) in zip(movie_letters, movie_xs, m_rendered):
        glow_img, _, _ = get_tight_letter(c, (255, 255, 255, 120))
        text_layer.alpha_composite(img, (x, movie_y))
        glow_layer.alpha_composite(glow_img, (x, movie_y))

    for c, x, (img, w, h) in zip(night_letters, night_xs, n_rendered):
        glow_img, _, _ = get_tight_letter(c, (*accent_color[:3], 180))
        text_layer.alpha_composite(img, (x, night_y))
        glow_layer.alpha_composite(glow_img, (x, night_y))

    if add_glow and not transparent_bg:
        glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=28))
        canvas.alpha_composite(glow_layer)

    canvas.alpha_composite(text_layer)

    # 4. Spidey Character
    # Feet sit at y=753 (just atop NIGHT at 755), Hand extends down to y=919 (IN FRONT OF NIGHT)
    spidey_raw = Image.open(character_img_path).convert("RGBA")
    s_w = int(spidey_raw.width * spidey_scale)
    s_h = int(spidey_raw.height * spidey_scale)
    spidey_img = spidey_raw.resize((s_w, s_h), Image.Resampling.LANCZOS)
    s_x = (canvas_w - s_w) // 2
    s_y = spidey_top

    # Subtle cinematic rim glow
    if add_glow and not transparent_bg:
        rim = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        c_alpha = spidey_img.split()[3]
        c_glow = Image.new("RGBA", spidey_img.size, (*accent_color[:3], 85))
        c_glow.putalpha(c_alpha)
        rim.paste(c_glow, (s_x, s_y), c_alpha)
        rim = rim.filter(ImageFilter.GaussianBlur(radius=24))
        canvas.alpha_composite(rim)

    # Composite Spidey in front of MOVIE and NIGHT!
    canvas.alpha_composite(spidey_img, (s_x, s_y))

    # 5. Bottom subtle vignette
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
    # 1. Primary: Spider-Man Marvel Red Accent (#e62429)
    create_spidey_vertical_banner(
        output_path="spidey_vertical_marvel_red.png",
        accent_color=(230, 36, 41)
    )

    # 2. Movie Night Violet Accent (#6355ff)
    create_spidey_vertical_banner(
        output_path="spidey_vertical_violet.png",
        accent_color=(99, 85, 255)
    )

    # 3. Web-Slinger Electric Blue Accent (#0070f3)
    create_spidey_vertical_banner(
        output_path="spidey_vertical_electric_blue.png",
        accent_color=(0, 112, 243)
    )

    # 4. Transparent PNG (Marvel Red)
    create_spidey_vertical_banner(
        output_path="spidey_vertical_transparent.png",
        accent_color=(230, 36, 41),
        transparent_bg=True,
        add_glow=False
    )

    # 5. Transparent PNG (Violet)
    create_spidey_vertical_banner(
        output_path="spidey_vertical_transparent_violet.png",
        accent_color=(99, 85, 255),
        transparent_bg=True,
        add_glow=False
    )
