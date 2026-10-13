import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

def create_final_bvs_banners():
    canvas_w, canvas_h = 2560, 1440
    accent_color = (99, 85, 255)  # Movie Night Violet
    
    # 1. Base characters
    char_raw = Image.open("pngegg-8.png").convert("RGBA")
    target_char_h = int(canvas_h * 0.94)
    scale_factor = target_char_h / char_raw.height
    target_char_w = int(char_raw.width * scale_factor)
    char_img = char_raw.resize((target_char_w, target_char_h), Image.Resampling.LANCZOS)
    char_x = (canvas_w - target_char_w) // 2
    char_y = canvas_h - target_char_h

    # 2. Typography
    font_size = 590
    v_stretch = 1.26
    h_stretch = 1.14
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

    # MOVIE:
    # Batman at MOVIE row: [790, 1150]
    # - M: starts at 360, width ~500 -> ends at 860. Batman covers 790..860 (70px of M). Left 430px open!
    # - O: starts at 880, width ~340 -> ends at 1220. Batman covers 880..1150 (270px). Gap has 1150..1220 (70px in gap)!
    # - V: starts at 1155, width ~330 -> ends at 1485. Centered right in confrontation gap!
    # - I: starts at 1435, width ~180 -> ends at 1615. Under Superman's chest.
    # - E: starts at 1660, width ~300 -> ends at 1960+. Superman covers 1660..1735 (75px). Right 230px+ extends proud!
    movie_letters = ["M", "O", "V", "I", "E"]
    movie_xs = [360, 880, 1155, 1435, 1660]
    movie_y = 185

    # NIGHT:
    # Batman at NIGHT row: [765, 1211]
    # - N: starts at 400, width ~350 -> ends at 750..810. Batman (765) covers 765..810 (45px = "end of letter N"). Left 365px open!
    # - I: starts at 790, width ~180 -> under Batman's belt.
    # - G: starts at 1015, width ~340 -> ends at 1355. Batman covers 1015..1211 (196px). Gap has 1211..1355 (144px in gap)!
    # - H: starts at 1335, width ~350 -> ends at 1685. Under Superman.
    # - T: starts at 1715, width ~280 -> ends at 1995+. Superman ends at 1794. Superman covers 1715..1794 (79px). Right 200px+ extends proud!
    night_letters = ["N", "I", "G", "H", "T"]
    night_xs = [400, 790, 1015, 1335, 1715]
    night_y = 785

    def render_full_poster(output_path, accent, transparent=False):
        if transparent:
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
                    fill=(*accent[:3], alpha)
                )
            bg = bg.filter(ImageFilter.GaussianBlur(radius=65))
            canvas.alpha_composite(bg)

        text_layer = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        glow_layer = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))

        for ch, x in zip(movie_letters, movie_xs):
            img, w, h = render_letter(ch, (255, 255, 255, 255))
            glow, _, _ = render_letter(ch, (255, 255, 255, 120))
            text_layer.alpha_composite(img, (x, movie_y))
            glow_layer.alpha_composite(glow, (x, movie_y))

        for ch, x in zip(night_letters, night_xs):
            img, w, h = render_letter(ch, (*accent, 255))
            glow, _, _ = render_letter(ch, (*accent, 190))
            text_layer.alpha_composite(img, (x, night_y))
            glow_layer.alpha_composite(glow, (x, night_y))

        if not transparent:
            glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=28))
            canvas.alpha_composite(glow_layer)

        canvas.alpha_composite(text_layer)

        if not transparent:
            rim = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
            c_alpha = char_img.split()[3]
            c_glow = Image.new("RGBA", char_img.size, (*accent, 85))
            c_glow.putalpha(c_alpha)
            rim.paste(c_glow, (char_x, char_y), c_alpha)
            rim = rim.filter(ImageFilter.GaussianBlur(radius=24))
            canvas.alpha_composite(rim)

        canvas.alpha_composite(char_img, (char_x, char_y))

        if not transparent:
            fade = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
            fd = ImageDraw.Draw(fade)
            fh = int(canvas_h * 0.12)
            for y in range(canvas_h - fh, canvas_h):
                prog = (y - (canvas_h - fh)) / fh
                fd.line([(0, y), (canvas_w, y)], fill=(6, 7, 10, int(255 * (prog ** 1.8))))
            canvas.alpha_composite(fade)

        canvas.save(output_path, "PNG", quality=95)
        print(f"Generated {output_path}")

    # 1. Primary: Brand Violet
    render_full_poster("bvs_vertical_marvel_anton_allcaps.png", (99, 85, 255))
    # 2. Golden Dawn of Justice
    render_full_poster("bvs_vertical_gold_edition.png", (245, 158, 11))
    # 3. Transparent PNG
    render_full_poster("bvs_vertical_transparent.png", (99, 85, 255), transparent=True)
    # 4. Also write to bvs_vertical_perfect_overlap.png
    render_full_poster("bvs_vertical_perfect_overlap.png", (99, 85, 255))

if __name__ == "__main__":
    create_final_bvs_banners()
