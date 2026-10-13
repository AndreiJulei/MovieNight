import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

def test_render(name, font_size, letter_spacing_movie, letter_spacing_night, h_stretch, v_stretch):
    canvas_w, canvas_h = 2560, 1440
    accent_color = (99, 85, 255)
    canvas = Image.new("RGBA", (canvas_w, canvas_h), (6, 7, 10, 255))
    
    # Backdrop glow
    bg = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)
    cx, cy = canvas_w // 2, canvas_h // 2
    for r in range(int(canvas_h * 0.75), 0, -25):
        norm = 1.0 - (r / (canvas_h * 0.75))
        alpha = int(45 * (norm ** 1.6))
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

    movie_chars = "MOVIE"
    night_chars = "NIGHT"
    
    m_rendered = [render_letter(c, (255, 255, 255, 255)) for c in movie_chars]
    n_rendered = [render_letter(c, (*accent_color, 255)) for c in night_chars]
    
    # Calculate positions centered at cx = 1280
    # For MOVIE: V is the center letter (index 2). We want V centered at cx=1280.
    # V width: m_rendered[2][1]
    v_w = m_rendered[2][1]
    v_x = cx - v_w // 2
    
    # O is to the left of V
    o_w = m_rendered[1][1]
    o_x = v_x - o_w - letter_spacing_movie
    
    # M is to the left of O
    m_w = m_rendered[0][1]
    m_x = o_x - m_w - letter_spacing_movie
    
    # I is to the right of V
    i_x = v_x + v_w + letter_spacing_movie
    i_w = m_rendered[3][1]
    
    # E is to the right of I
    e_x = i_x + i_w + letter_spacing_movie
    e_w = m_rendered[4][1]
    
    movie_xs = [m_x, o_x, v_x, i_x, e_x]
    movie_y = int(canvas_h * 0.33) - 230

    # For NIGHT: center is between I, G, H
    # Total width of NIGHT:
    night_total_w = sum(img[1] for img in n_rendered) + 4 * letter_spacing_night
    night_start_x = cx - night_total_w // 2
    
    night_xs = []
    curr_x = night_start_x
    for img, w, h in n_rendered:
        night_xs.append(curr_x)
        curr_x += w + letter_spacing_night
    night_y = int(canvas_h * 0.72) - 230

    print(f"=== {name} ===")
    print("MOVIE letters [M, O, V, I, E]:")
    for ch, x, (img, w, h) in zip(movie_chars, movie_xs, m_rendered):
        print(f"  {ch}: [{x}, {x+w}] (w={w})")
    print("NIGHT letters [N, I, G, H, T]:")
    for ch, x, (img, w, h) in zip(night_chars, night_xs, n_rendered):
        print(f"  {ch}: [{x}, {x+w}] (w={w})")

    # Composite text
    text_layer = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    glow_layer = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))

    for ch, x, (img, w, h) in zip(movie_chars, movie_xs, m_rendered):
        glow, _, _ = render_letter(ch, (255, 255, 255, 120))
        text_layer.alpha_composite(img, (x, movie_y))
        glow_layer.alpha_composite(glow, (x, movie_y))

    for ch, x, (img, w, h) in zip(night_chars, night_xs, n_rendered):
        glow, _, _ = render_letter(ch, (*accent_color, 200))
        text_layer.alpha_composite(img, (x, night_y))
        glow_layer.alpha_composite(glow, (x, night_y))

    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=28))
    canvas.alpha_composite(glow_layer)
    canvas.alpha_composite(text_layer)

    # Rim glow on characters
    rim = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    c_alpha = char_img.split()[3]
    c_glow = Image.new("RGBA", char_img.size, (*accent_color, 85))
    c_glow.putalpha(c_alpha)
    rim.paste(c_glow, (char_x, char_y), c_alpha)
    rim = rim.filter(ImageFilter.GaussianBlur(radius=24))
    canvas.alpha_composite(rim)

    # Characters in front
    canvas.alpha_composite(char_img, (char_x, char_y))

    # Bottom vignette
    fade = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fade)
    fh = int(canvas_h * 0.12)
    for y in range(canvas_h - fh, canvas_h):
        prog = (y - (canvas_h - fh)) / fh
        fd.line([(0, y), (canvas_w, y)], fill=(6, 7, 10, int(255 * (prog ** 1.8))))
    canvas.alpha_composite(fade)

    canvas.save(f"{name}.png", "PNG", quality=95)
    print(f"Generated {name}.png")

# Test configurations
test_render("bvs_centered_balanced", font_size=580, letter_spacing_movie=18, letter_spacing_night=32, h_stretch=1.1, v_stretch=1.25)
test_render("bvs_centered_grand", font_size=630, letter_spacing_movie=24, letter_spacing_night=40, h_stretch=1.15, v_stretch=1.20)
test_render("bvs_centered_massive", font_size=680, letter_spacing_movie=30, letter_spacing_night=48, h_stretch=1.2, v_stretch=1.18)
