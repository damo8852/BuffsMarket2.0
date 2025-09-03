from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from graphene_django.views import GraphQLView

class ProtectGraphQL(LoginRequiredMixin, UserPassesTestMixin, GraphQLView):
    login_url = "/admin/login/" 
    redirect_field_name = "next"  
    def test_func(self):
        return self.request.user.is_superuser
