<?php

namespace Database\Factories;

use App\Models\Post;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Post>
 */
class PostFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => 1,
            'title' => fake()->sentence(),
            'body' => fake()->paragraph(),
            'featured' => false,
        ];
    }
}
