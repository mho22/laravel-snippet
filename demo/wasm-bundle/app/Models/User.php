<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Cashier\Billable;

#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use Billable, HasFactory, Notifiable, SoftDeletes;

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function posts(): HasMany
    {
        return $this->hasMany(Post::class);
    }

    public function featuredPosts(): HasMany
    {
        return $this->hasMany(Post::class)->where('featured', true);
    }

    public function comments(): HasMany
    {
        return $this->hasMany(Comment::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class);
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(self::class, 'author_id');
    }

    public function tokens(): HasMany
    {
        return $this->hasMany(self::class, 'user_id');
    }

    public function history(): HasMany
    {
        return $this->hasMany(self::class, 'user_id');
    }

    public function conversations(): HasMany
    {
        return $this->hasMany(self::class, 'user_id');
    }

    public function scopePopular(Builder $query): Builder
    {
        return $query;
    }

    public function scopeLost(Builder $query): Builder
    {
        return $query;
    }

    public function isActive(): bool
    {
        return true;
    }

    public function isBanned(): bool
    {
        return false;
    }

    public function isAdmin(): bool
    {
        return (bool) ($this->attributes['is_admin'] ?? false);
    }

    public function getIsAdminAttribute(): bool
    {
        return (bool) ($this->attributes['is_admin'] ?? false);
    }

    public function tokenCan(string $ability): bool
    {
        return true;
    }
}
