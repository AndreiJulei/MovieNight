import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

def generate_equal_spaced_poster(
    output_path,
    font_size=630,
    v_stretch=1.16,
    h_stretch=1.12,
    gap_movie=25,
    gap_night=45,
    movie_y=75,
    night_y=765,
    movie_start_x=380,
    night_start_x=390,
    accent_color=(99, 85, 255),
    transparent_bg=False,
    add_glow=True
):
    canvas_w, canvas_h = 2560, 1440
    
    # 1. Base Canvas
    if transparent_bg:
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    else:
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (6, 7, 10, 255))
        # Atmospheric dual-tone glow
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
    char_raw = Image.open("pngegg-8.png").convert("RGBA")
    target_char_h = int(canvas_h * 0.94)
    scale_factor = target_char_h / char_raw.height
    target_char_w = int(char_raw.width * scale_factor)
    char_img = char_raw.resize((target_char_w, target_char_h), Image.Resampling.LANCZOS)
    char_x = (canvas_w - target_char_w) // 2
    char_y = canvas_h - target_char_h

    # 3. Typography with TIGHT BOUNDING BOXES (no artificial padding!)
    font = ImageFont.truetype("fonts/Anton.ttf", font_size)

    def get_tight_letter(ch, fill):
        # Render onto a temporary canvas and crop to tight alpha bounding box
        temp = Image.new("RGBA", (int(font_size * 2), int(font_size * 2)), (0, 0, 0, 0))
        d = ImageDraw.Draw(temp)
        d.text((50, 50), ch, font=font, fill=fill)
        bbox = temp.getbbox()
        cropped = temp.crop(bbox)
        # Apply scaling
        orig_w, orig_h = cropped.size
        new_w = int(orig_w * h_stretch)
        new_h = int(orig_h * v_stretch)
        scaled = cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)
        return scaled, new_w, new_h

    # Compute letters and strictly equal spaced positions for MOVIE
    movie_letters = "MOVIE"
    movie_rendered = [get_tight_letter(c, (255, 255, 255, 255)) for c in movie_letters]
    movie_xs = []
    curr = movie_start_x
    for img, w, h in movie_rendered:
        movie_xs.append(curr)
        curr += w + gap_movie

    # Compute letters and strictly equal spaced positions for NIGHT
    night_letters = "NIGHT"
    night_rendered = [get_tight_letter(c, (*accent_color, 255)) for c in night_letters]
    night_xs = []
    curr = night_start_x
    for img, w, h in night_rendered:
        night_xs.append(curr)
        curr += w + gap_night

    print(f"=== {output_path} ===")
    print(f"MOVIE (y={movie_y}, gap={gap_movie}px, height={movie_rendered[0][2]}px):")
    for c, x, (img, w, h) in zip(movie_letters, movie_xs, movie_rendered):
        print(f"  {c}: [{x}, {x+w}] (w={w})")
    movie_end = movie_xs[-1] + movie_rendered[-1][1]
    movie_total_w = movie_end - movie_start_x
    print(f"  MOVIE span: [{movie_start_x}, {movie_end}] total_w={movie_total_w}, center={(movie_start_x+movie_end)/2}")
    
    print(f"NIGHT (y={night_y}, gap={gap_night}px, height={night_rendered[0][2]}px):")
    for c, x, (img, w, h) in zip(night_letters, night_xs, night_rendered):
        print(f"  {c}: [{x}, {x+w}] (w={w})")
    night_end = night_xs[-1] + night_rendered[-1][1]
    night_total_w = night_end - night_start_x
    print(f"  NIGHT span: [{night_start_x}, {night_end}] total_w={night_total_w}, center={(night_start_x+night_end)/2}")
    print(f"Vertical separation (night_y - movie_bottom): {night_y - (movie_y + movie_rendered[0][2])}px")

    # 4. Text & Glow composite
    text_layer = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    glow_layer = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))

    for c, x, (img, w, h) in zip(movie_letters, movie_xs, movie_rendered):
        glow_img, _, _ = get_tight_letter(c, (255, 255, 255, 125))
        text_layer.alpha_composite(img, (x, movie_y))
        glow_layer.alpha_composite(glow_img, (x, movie_y))

    for c, x, (img, w, h) in zip(night_letters, night_xs, night_rendered):
        glow_img, _, _ = get_tight_letter(c, (*accent_color, 190))
        text_layer.alpha_composite(img, (x, night_y))
        glow_layer.alpha_composite(glow_img, (x, night_y))

    if add_glow and not transparent_bg:
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

    # Bottom subtle vignette
    if not transparent_bg:
        fade = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        fd = ImageDraw.Draw(fade)
        fh = int(canvas_h * 0.12)
        for y in range(canvas_h - fh, canvas_h):
            prog = (y - (canvas_h - fh)) / fh
            fd.line([(0, y), (canvas_w, y)], fill=(6, 7, 10, int(255 * (prog ** 1.8))))
        canvas.alpha_composite(fade)

    canvas.save(output_path, "PNG", quality=95)
    print(f"Successfully generated {output_path}\n")

# Let's test a few variations with exact equal spacing and higher MOVIE placement:
# Option 1: Balanced Equal Spacing (movie_y=75, night_y=765, 70px vertical gap)
generate_equal_spaced_poster(
    "bvs_equal_spaced_v1.png",
    font_size=630, v_stretch=1.16, h_stretch=1.12,
    gap_movie=24, gap_night=44,
    movie_y=75, night_y=765,
    movie_start_x=370, night_start_x=390
)

# Option 2: Wider Blockbuster (font_size=650, h_stretch=1.16, gap_movie=28, gap_night=50)
generate_equal_spaced_poster(
    "bvs_equal_spaced_v2.png",
    font_size=650, v_stretch=1.15, h_stretch=1.16,
    gap_movie=28, gap_night=52,
    movie_y=70, night_y=760,
    movie_start_x=330, night_start_x=360
)

# Option 3: Extra High MOVIE (movie_y=55, night_y=760, 90px vertical gap)
generate_equal_spaced_poster(
    "bvs_equal_spaced_v3.png",
    font_size=640, v_stretch=1.16, h_stretch=1.14,
    gap_movie=26, gap_night=48,
    movie_y=55, night_y=760,
    movie_start_x=350, night_start_x=375
)
