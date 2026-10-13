import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

def create_killbill_banner(
    character_img_path="sparkpixai-generated-1789481626588.png",
    output_path="killbill_marvel_anton_yellow.png",
    font_path="fonts/Anton.ttf",
    canvas_w=2560,
    canvas_h=1440,
    font_size=460,
    vertical_stretch=1.35,
    target_bottom_y=680,        # Bottom of logo sits above page middle (680px vs 720px midpoint)
    left_x=80,                  # MOVIE x start
    right_x=1460,               # NIGHT x start (Total span 80..2468, centered at x=1274)
    accent_color=(248, 188, 51),# Tracksuit Yellow (#f8bc33)
    transparent_bg=False,
    add_glow=True,
    char_scale_h=1440,
    char_x_offset=0
):
    """
    Generates high-impact Kill Bill / The Bride desktop hero banner in the Anton Marvel All-Caps style,
    matching joker_marvel_anton_allcaps.png with centered horizontal typography placed above the middle
    behind Beatrix Kiddo and her katana blade.
    """
    # 1. Typography (Anton All-Caps with Marvel-style Vertical Stretch)
    font = ImageFont.truetype(font_path, font_size)

    def render_stretched_word(text, fill_color):
        bbox = font.getbbox(text)
        w = bbox[2] - bbox[0] + 40
        h = bbox[3] - bbox[1] + 40
        temp = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(temp)
        d.text((-bbox[0] + 20, -bbox[1] + 20), text, font=font, fill=fill_color)
        new_h = int(h * vertical_stretch)
        return temp.resize((w, new_h), Image.Resampling.LANCZOS)

    word_m_img = render_stretched_word("MOVIE", (255, 255, 255, 255))
    word_n_img = render_stretched_word("NIGHT", (*accent_color[:3], 255))

    m_ink = word_m_img.getbbox()
    m_y = target_bottom_y - m_ink[3]
    n_y = m_y
    center_y = m_y + (word_m_img.height // 2)

    # 2. Canvas Setup
    if transparent_bg:
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    else:
        # Deep dark cinematic backdrop
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (6, 7, 10, 255))
        
        # Atmospheric backlight halo behind character & logo
        bg = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        bg_draw = ImageDraw.Draw(bg)
        cx, cy = canvas_w // 2, center_y
        for r in range(int(canvas_h * 0.60), 0, -20):
            norm = 1.0 - (r / (canvas_h * 0.60))
            alpha = int(45 * (norm ** 1.5))
            bg_draw.ellipse(
                (cx - int(r * 1.8), cy - r, cx + int(r * 1.8), cy + r),
                fill=(*accent_color[:3], alpha)
            )
        bg = bg.filter(ImageFilter.GaussianBlur(radius=60))
        canvas.alpha_composite(bg)

    # 3. Text Glow Layer
    if add_glow and not transparent_bg:
        glow = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        gm = render_stretched_word("MOVIE", (255, 255, 255, 120))
        gn = render_stretched_word("NIGHT", (*accent_color[:3], 180))
        glow.alpha_composite(gm, (left_x, m_y))
        glow.alpha_composite(gn, (right_x, n_y))
        glow = glow.filter(ImageFilter.GaussianBlur(radius=24))
        canvas.alpha_composite(glow)

    # Paste text onto canvas
    canvas.alpha_composite(word_m_img, (left_x, m_y))
    canvas.alpha_composite(word_n_img, (right_x, n_y))

    # 4. Foreground Character Cutout (Beatrix Kiddo / The Bride)
    char_raw = Image.open(character_img_path).convert("RGBA")
    scale = char_scale_h / char_raw.height
    cw = int(char_raw.width * scale)
    char_img = char_raw.resize((cw, char_scale_h), Image.Resampling.LANCZOS)
    cx_pos = ((canvas_w - cw) // 2) + char_x_offset
    cy_pos = canvas_h - char_scale_h

    # Subtle cinematic character rim glow
    if add_glow and not transparent_bg:
        rim = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        c_alpha = char_img.split()[3]
        c_glow = Image.new("RGBA", char_img.size, (*accent_color[:3], 80))
        c_glow.putalpha(c_alpha)
        rim.paste(c_glow, (cx_pos, cy_pos), c_alpha)
        rim = rim.filter(ImageFilter.GaussianBlur(radius=22))
        canvas.alpha_composite(rim)

    # Composite character in front of typography
    canvas.alpha_composite(char_img, (cx_pos, cy_pos))

    # 5. Bottom Vignette
    if not transparent_bg:
        fade = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        fd = ImageDraw.Draw(fade)
        fh = int(canvas_h * 0.10)
        for y in range(canvas_h - fh, canvas_h):
            prog = (y - (canvas_h - fh)) / fh
            fd.line([(0, y), (canvas_w, y)], fill=(6, 7, 10, int(255 * (prog ** 1.8))))
        canvas.alpha_composite(fade)

    canvas.save(output_path, "PNG", quality=95)
    total_w = (right_x + word_n_img.width) - left_x
    center_x = (left_x + right_x + word_n_img.width) / 2
    print(f"Generated {output_path} successfully (span=[{left_x}, {right_x + word_n_img.width}], center={center_x:.1f}, center_y={center_y})")

if __name__ == "__main__":
    # 1. Primary: Tracksuit Yellow Edition (#f8bc33)
    create_killbill_banner(
        output_path="killbill_marvel_anton_yellow.png",
        accent_color=(248, 188, 51)
    )

    # 2. Movie Night Violet Accent (#6355ff)
    create_killbill_banner(
        output_path="killbill_marvel_anton_violet.png",
        accent_color=(99, 85, 255)
    )

    # 3. Transparent PNG (Yellow)
    create_killbill_banner(
        output_path="killbill_transparent_yellow.png",
        accent_color=(248, 188, 51),
        transparent_bg=True,
        add_glow=False
    )

    # 4. Transparent PNG (Violet)
    create_killbill_banner(
        output_path="killbill_transparent_violet.png",
        accent_color=(99, 85, 255),
        transparent_bg=True,
        add_glow=False
    )
