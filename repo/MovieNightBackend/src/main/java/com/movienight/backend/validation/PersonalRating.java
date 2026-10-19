package com.movienight.backend.validation;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

import java.lang.annotation.Retention;
import java.lang.annotation.Target;

import static java.lang.annotation.ElementType.FIELD;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

/** Optional personal rating: zero through ten, in exact half-point steps. */
@Target(FIELD)
@Retention(RUNTIME)
@Constraint(validatedBy = PersonalRating.Validator.class)
public @interface PersonalRating {
    String message() default "Personal rating must be 0 to 10 in half-point steps";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};

    class Validator implements ConstraintValidator<PersonalRating, Double> {
        @Override
        public boolean isValid(Double value, ConstraintValidatorContext context) {
            return value == null || (Double.isFinite(value) && value >= 0 && value <= 10
                    && value * 2 == Math.rint(value * 2));
        }
    }
}
