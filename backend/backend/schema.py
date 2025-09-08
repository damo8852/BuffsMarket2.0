# backend/schema.py
import re
import uuid
import graphene
import django
from django.conf import settings
import jwt
from datetime import datetime, timedelta
from decimal import Decimal
from django.db import models, transaction
from django.utils import timezone
from graphene_django import DjangoObjectType
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
import graphql_jwt
from django.core.exceptions import PermissionDenied
from google.cloud import storage

if not settings.configured:
    django.setup()

GCS_BUCKET_NAME = getattr(settings, "GCS_BUCKET_NAME", None)
GCS_UPLOAD_PREFIX = getattr(settings, "GCS_UPLOAD_PREFIX", "listings")

def _current_user(info):
    req = info.context
    auth = ""
    # Django's WSGIRequest
    if hasattr(req, "META"):
        auth = req.META.get("HTTP_AUTHORIZATION", "") or auth
    # Django >=2.2 convenience
    if hasattr(req, "headers"):
        auth = req.headers.get("Authorization", auth)

    if not auth:
        return None

    parts = auth.strip().split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        token = parts[1]
    else:
        # allow raw token without the "Bearer" prefix, just in case
        token = auth.strip()

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except Exception:
        return None

    uid = payload.get("user_id")
    if not uid:
        return None
    try:
        return User.objects.get(pk=uid)
    except User.DoesNotExist:
        return None


class Listing(models.Model):
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column="user_id", related_name="listings")
    title = models.CharField(max_length=255)
    description = models.TextField()
    price = models.DecimalField(max_digits=10, decimal_places=2)
    date_listed = models.DateTimeField(db_column="date_listed", null=True, blank=True)
    sold = models.BooleanField(default=False)
    class Meta:
        db_table = "listings"
        managed = False
        app_label = "backend"

class ListingImage(models.Model):
    id = models.AutoField(primary_key=True)
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, db_column="listing_id", related_name="images")
    image_url = models.TextField()
    class Meta:
        db_table = "listing_images"
        managed = False
        app_label = "backend"

class UserType(DjangoObjectType):
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name')

class ListingImageType(DjangoObjectType):
    class Meta:
        model = ListingImage
        fields = ("id", "image_url")

class ListingType(DjangoObjectType):
    class Meta:
        model = Listing
        fields = ("id", "title", "description", "price", "date_listed", "sold", "user", "images")

class AuthPayload(graphene.ObjectType):
    token = graphene.String()
    user = graphene.Field(UserType)
    success = graphene.Boolean()
    message = graphene.String()

class LoginMutation(graphene.Mutation):
    class Arguments:
        email = graphene.String(required=True)
        password = graphene.String(required=True)
    Output = AuthPayload
    def mutate(self, info, email, password):
        try:
            user = User.objects.get(email=email)
            user = authenticate(username=user.username, password=password)
        except User.DoesNotExist:
            user = None
        if user is not None and user.is_active:
            payload = {
                'user_id': user.id,
                'email': user.email,
                'exp': datetime.utcnow() + timedelta(days=7)
            }
            token = jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')
            return AuthPayload(token=token, user=user, success=True, message="Login successful")
        if user is not None and not user.is_active:
            return AuthPayload(token=None, user=None, success=False, message="User account is disabled")
        return AuthPayload(token=None, user=None, success=False, message="Invalid credentials")

class RegisterMutation(graphene.Mutation):
    class Arguments:
        username = graphene.String(required=True)
        email = graphene.String(required=True)
        password = graphene.String(required=True)
        first_name = graphene.String()
        last_name = graphene.String()
    Output = AuthPayload
    def mutate(self, info, username, email, password, first_name="", last_name=""):
        try:
            if User.objects.filter(username=username).exists():
                return AuthPayload(token=None, user=None, success=False, message="Username already exists")
            if User.objects.filter(email=email).exists():
                return AuthPayload(token=None, user=None, success=False, message="Email already exists")
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
                first_name=first_name,
                last_name=last_name
            )
            payload = {
                'user_id': user.id,
                'username': user.username,
                'exp': datetime.utcnow() + timedelta(days=7)
            }
            token = jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')
            return AuthPayload(token=token, user=user, success=True, message="Registration successful")
        except Exception as e:
            return AuthPayload(token=None, user=None, success=False, message=f"Registration failed: {str(e)}")

class Query(graphene.ObjectType):
    users = graphene.List(UserType)
    user = graphene.Field(UserType, id=graphene.Int(required=True))
    me = graphene.Field(UserType)

    listings = graphene.List(
        ListingType,
        search=graphene.String(),
        owner_id=graphene.Int(),
        include_sold=graphene.Boolean(default_value=False),
        sold=graphene.Boolean(),
    )
    listing = graphene.Field(ListingType, id=graphene.ID(required=True))
    my_listings = graphene.List(ListingType, include_sold=graphene.Boolean(default_value=False))

    def resolve_users(self, info):
        return User.objects.all()

    def resolve_user(self, info, id):
        return User.objects.get(pk=id)

    def resolve_me(self, info):
        return _current_user(info)

    def resolve_listings(self, info, search=None, owner_id=None, include_sold=False, sold=None):
        qs = Listing.objects.select_related("user").prefetch_related("images").order_by("-date_listed", "-id")
        if owner_id:
            qs = qs.filter(user_id=owner_id)
        if search:
            qs = qs.filter(models.Q(title__icontains=search) | models.Q(description__icontains=search))
        if sold is not None:
            qs = qs.filter(sold=sold)
        elif not include_sold:
            qs = qs.filter(sold=False)
        return qs

    def resolve_listing(self, info, id):
        try:
            return Listing.objects.select_related("user").prefetch_related("images").get(pk=id)
        except Listing.DoesNotExist:
            return None

    def resolve_my_listings(self, info, include_sold=False):
        user = _current_user(info)
        if not user:
            return []
        qs = Listing.objects.filter(user=user).prefetch_related("images").order_by("-date_listed", "-id")
        if not include_sold:
            qs = qs.filter(sold=False)
        return qs

class ListingPayload(graphene.ObjectType):
    success = graphene.Boolean()
    message = graphene.String()
    listing = graphene.Field(ListingType)

class CreateListing(graphene.Mutation):
    class Arguments:
        title = graphene.String(required=True)
        description = graphene.String(required=True)
        price = graphene.Decimal(required=True)
        image_urls = graphene.List(graphene.String)
    Output = ListingPayload
    def mutate(self, info, title, description, price, image_urls=None):
        user = _current_user(info)
        if not user:
            return ListingPayload(success=False, message="Authentication required.", listing=None)
        price_dec = Decimal(price)
        if price_dec < Decimal("0"):
            return ListingPayload(success=False, message="Price must be non-negative.", listing=None)
        with transaction.atomic():
            listing = Listing.objects.create(
                user=user,
                title=title,
                description=description,
                price=price_dec,
                date_listed=timezone.now(),
                sold=False,
            )
            if image_urls:
                ListingImage.objects.bulk_create(
                    [ListingImage(listing=listing, image_url=url) for url in image_urls]
                )
        return ListingPayload(success=True, message="Listing created.", listing=listing)

class UpdateListing(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        title = graphene.String()
        description = graphene.String()
        price = graphene.Decimal()
        add_image_urls = graphene.List(graphene.String)
        remove_image_ids = graphene.List(graphene.Int)
        sold = graphene.Boolean()
    Output = ListingPayload
    def mutate(self, info, id, title=None, description=None, price=None, add_image_urls=None, remove_image_ids=None, sold=None):
        user = _current_user(info)
        if not user:
            return ListingPayload(success=False, message="Authentication required.", listing=None)
        try:
            listing = Listing.objects.get(pk=id)
        except Listing.DoesNotExist:
            return ListingPayload(success=False, message="Listing not found.", listing=None)
        if not (listing.user_id == user.id or user.is_staff):
            raise PermissionDenied("Not allowed to edit this listing.")
        with transaction.atomic():
            if title is not None:
                listing.title = title
            if description is not None:
                listing.description = description
            if price is not None:
                price_dec = Decimal(price)
                if price_dec < Decimal("0"):
                    return ListingPayload(success=False, message="Price must be non-negative.", listing=None)
                listing.price = price_dec
            if sold is not None:
                listing.sold = sold
            listing.save()
            if add_image_urls:
                ListingImage.objects.bulk_create(
                    [ListingImage(listing=listing, image_url=url) for url in add_image_urls]
                )
            if remove_image_ids:
                ListingImage.objects.filter(id__in=remove_image_ids, listing=listing).delete()
        return ListingPayload(success=True, message="Listing updated.", listing=listing)

class SetListingSold(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        sold = graphene.Boolean(required=True)
    Output = ListingPayload
    def mutate(self, info, id, sold):
        user = _current_user(info)
        if not user:
            return ListingPayload(success=False, message="Authentication required.", listing=None)
        try:
            listing = Listing.objects.get(pk=id)
        except Listing.DoesNotExist:
            return ListingPayload(success=False, message="Listing not found.", listing=None)
        if not (listing.user_id == user.id or user.is_staff):
            raise PermissionDenied("Not allowed to update this listing.")
        listing.sold = sold
        listing.save(update_fields=["sold"])
        msg = "Listing marked as sold." if sold else "Listing restored."
        return ListingPayload(success=True, message=msg, listing=listing)

class DeleteListingImage(graphene.Mutation):
    class Arguments:
        image_id = graphene.ID(required=True)
    Output = graphene.Boolean
    def mutate(self, info, image_id):
        user = _current_user(info)
        if not user:
            return False
        try:
            img = ListingImage.objects.select_related("listing").get(pk=image_id)
        except ListingImage.DoesNotExist:
            return False
        if not (img.listing.user_id == user.id or user.is_staff):
            raise PermissionDenied("Not allowed.")
        img.delete()
        return True

def _secure_name(name: str) -> str:
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._")
    return base or f"file_{uuid.uuid4().hex}"

def _signed_put_url(object_name: str, content_type: str, minutes: int = 10):
    if not GCS_BUCKET_NAME:
        raise RuntimeError("GCS_BUCKET_NAME is not configured.")
    client = storage.Client()
    bucket = client.bucket(GCS_BUCKET_NAME)
    blob = bucket.blob(object_name)
    url = blob.generate_signed_url(
        version="v4",
        expiration=timedelta(minutes=minutes),
        method="PUT",
        content_type=content_type,
    )
    public_url = f"https://storage.googleapis.com/{GCS_BUCKET_NAME}/{object_name}"
    return url, public_url

class UploadURLPayload(graphene.ObjectType):
    signed_url = graphene.String()
    public_url = graphene.String()
    object_name = graphene.String()

class GenerateListingImageUploadUrl(graphene.Mutation):
    class Arguments:
        filename = graphene.String(required=True)
        content_type = graphene.String(required=True)
    Output = UploadURLPayload
    def mutate(self, info, filename, content_type):
        if not content_type.startswith("image/"):
            raise ValueError("Only image uploads are allowed.")
        user = _current_user(info)
        if not user:
            raise PermissionDenied("Authentication required.")
        safe = _secure_name(filename)
        object_name = f"{GCS_UPLOAD_PREFIX}/user_{user.id}/{uuid.uuid4().hex}_{safe}"
        signed_url, public_url = _signed_put_url(object_name, content_type, minutes=10)
        return UploadURLPayload(signed_url=signed_url, public_url=public_url, object_name=object_name)

class Mutation(graphene.ObjectType):
    login = LoginMutation.Field()
    register = RegisterMutation.Field()
    token_auth = graphql_jwt.ObtainJSONWebToken.Field()
    verify_token = graphql_jwt.Verify.Field()
    refresh_token = graphql_jwt.Refresh.Field()
    create_listing = CreateListing.Field()
    update_listing = UpdateListing.Field()
    set_listing_sold = SetListingSold.Field()
    delete_listing_image = DeleteListingImage.Field()
    generate_listing_image_upload_url = GenerateListingImageUploadUrl.Field()

schema = graphene.Schema(query=Query, mutation=Mutation)
